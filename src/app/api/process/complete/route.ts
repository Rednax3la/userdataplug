import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeEmail, normalizePhone, normalizeCountry, normalizeName, normalizeGender, splitFullName } from "@/lib/extraction/normalizers";
import { findDuplicates } from "@/lib/extraction/deduplicator";
import type { ExtractedEntity, Contact } from "@/types";

// Called by the Python extractor service when processing is complete
export async function POST(req: NextRequest) {
  // Verify secret
  const secret = req.headers.get("x-secret");
  if (secret !== process.env.EXTRACTOR_SERVICE_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { document_id, entities, error: extractionError } = body as {
    document_id: string;
    entities: ExtractedEntity[];
    error?: string;
  };

  const supabase = await createServiceClient();

  if (extractionError) {
    await supabase
      .from("source_documents")
      .update({ status: "failed", error_message: extractionError })
      .eq("id", document_id);

    await supabase.from("processing_logs").insert({
      source_document_id: document_id,
      stage: "extract",
      status: "error",
      message: extractionError,
    });

    return NextResponse.json({ ok: false });
  }

  // Update status to normalizing
  await supabase
    .from("source_documents")
    .update({ status: "normalizing" })
    .eq("id", document_id);

  // Load existing contacts for dedup (email-indexed lookup)
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
    .eq("is_duplicate", false);

  const existing = (existingContacts ?? []) as Contact[];

  let inserted = 0;
  let updated = 0;
  const dupPairs: Array<{ a: string; b: string; score: number; reasons: string[] }> = [];

  for (const entity of entities) {
    // Normalize all fields
    const email = normalizeEmail(entity.email);
    const emailAlt = normalizeEmail(entity.email_alt);
    const phone = normalizePhone(entity.phone);
    const country = normalizeCountry(entity.country);
    const gender = normalizeGender(entity.gender);

    let firstName = normalizeName(entity.first_name);
    let lastName = normalizeName(entity.last_name);
    let fullName = normalizeName(entity.full_name);

    // If only full_name, try splitting
    if (fullName && !firstName && !lastName) {
      const split = splitFullName(fullName);
      firstName = split.first_name;
      lastName = split.last_name;
    }
    // If only first+last, compute full_name
    if (!fullName && (firstName || lastName)) {
      fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    }

    const normalized: Omit<Contact, "id" | "created_at" | "updated_at"> = {
      email,
      email_alt: emailAlt,
      phone,
      phone_raw: entity.phone ?? null,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      gender,
      country,
      country_raw: entity.country ?? null,
      city: normalizeName(entity.city) ?? null,
      address: entity.address ?? null,
      company: entity.company ?? null,
      role: entity.role ?? null,
      occupation: entity.occupation ?? null,
      age: entity.age ?? null,
      estimated_age: entity.estimated_age ?? null,
      social_links: entity.social_links ?? null,
      interests: entity.interests ?? null,
      tags: entity.tags ?? null,
      purchase_signals: null,
      invoice_history: null,
      primary_source_id: document_id,
      all_source_ids: [document_id],
      field_sources: {},
      confidence_score: entity.confidence_score,
      flags: entity.flags ?? [],
      is_flagged: (entity.flags ?? []).length > 0,
      opted_out: false,
      opted_out_at: null,
      consent_source: null,
      canonical_id: null,
      is_duplicate: false,
      merged_from: [],
    };

    // Dedup check
    const matches = findDuplicates(entity, existing);

    if (matches.length > 0 && matches[0].score >= 0.85) {
      // Very high confidence match — mark as potential duplicate
      const existingId = matches[0].contact_id;
      dupPairs.push({
        a: existingId,
        b: "pending",  // will be filled after insert
        score: matches[0].score,
        reasons: matches[0].reasons,
      });
      normalized.is_flagged = true;
      normalized.flags = [...(normalized.flags ?? []), "potential_duplicate"];
    }

    // Insert contact
    const { data: newContact, error: insertErr } = await supabase
      .from("contacts")
      .insert(normalized)
      .select("id")
      .single();

    if (insertErr || !newContact) continue;

    inserted++;

    // Fix dup pair b reference
    if (dupPairs.length > 0 && dupPairs[dupPairs.length - 1].b === "pending") {
      dupPairs[dupPairs.length - 1].b = newContact.id;
    }

    // Add to existing for subsequent dedup checks this batch
    existing.push({ ...normalized, id: newContact.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Contact);
  }

  // Insert duplicate candidate pairs
  if (dupPairs.length > 0) {
    const validPairs = dupPairs.filter((p) => p.b !== "pending");
    if (validPairs.length > 0) {
      await supabase.from("duplicate_candidates").insert(
        validPairs.map((p) => ({
          contact_a: p.a,
          contact_b: p.b,
          match_score: p.score,
          match_reasons: p.reasons,
          status: "pending",
        }))
      );
    }
  }

  // Mark document done
  await supabase
    .from("source_documents")
    .update({
      status: "done",
      entities_found: entities.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", document_id);

  await supabase.from("processing_logs").insert({
    source_document_id: document_id,
    stage: "deduplicate",
    status: "success",
    message: `Inserted ${inserted}, updated ${updated}, ${dupPairs.length} duplicate pairs flagged`,
    metadata: { inserted, updated, dup_pairs: dupPairs.length },
  });

  return NextResponse.json({ ok: true, inserted, updated });
}
