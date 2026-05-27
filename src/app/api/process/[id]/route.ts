import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runExtractionPipeline, normalizeEntities } from "@/lib/extraction/pipeline";
import { mergeContacts } from "@/lib/extraction/deduplicator";
import type { Contact } from "@/types";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: uploadId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = await createServiceClient();

  const { data: upload } = await service
    .from("uploads")
    .select("*")
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

  if (upload.status === "done") {
    return NextResponse.json({ status: "done" });
  }

  const { data: doc } = await service
    .from("source_documents")
    .select("*")
    .eq("upload_id", uploadId)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await Promise.all([
    service.from("uploads").update({ status: "processing" }).eq("id", uploadId),
    service.from("source_documents").update({ status: "parsing" }).eq("id", doc.id),
  ]);

  try {
    // Download file
    const { data: fileData, error: dlError } = await service.storage
      .from("uploads")
      .download(upload.storage_path);

    if (dlError || !fileData) throw new Error(dlError?.message ?? "Download failed");

    const buffer = await fileData.arrayBuffer();

    await service.from("source_documents").update({ status: "extracting" }).eq("id", doc.id);

    const normalizedContacts = await runExtractionPipeline(
      buffer,
      upload.file_type,
      doc.id,
      process.env.ANTHROPIC_API_KEY
    );

    if (normalizedContacts.length === 0) {
      await service.from("source_documents").update({
        status: "done",
        entities_found: 0,
        completed_at: new Date().toISOString(),
      }).eq("id", doc.id);
      await service.from("uploads").update({ status: "done" }).eq("id", uploadId);
      return NextResponse.json({ upload_id: uploadId, inserted: 0, status: "done" });
    }

    await service.from("source_documents").update({ status: "deduplicating" }).eq("id", doc.id);

    // ── Fast DB-level exact dedup (no in-memory fuzzy scan) ────────────────
    // Collect all emails and phones from the new batch
    const newEmails = normalizedContacts.map(c => c.email).filter((e): e is string => !!e);
    const newPhones = normalizedContacts.map(c => c.phone).filter((p): p is string => !!p);

    // Single indexed query — find any existing contacts that share an email or phone
    const matchQueries: Promise<{ data: Contact[] | null }>[] = [];

    if (newEmails.length > 0) {
      matchQueries.push(
        service
          .from("contacts")
          .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
          .in("email", newEmails)
          .eq("is_duplicate", false) as unknown as Promise<{ data: Contact[] | null }>
      );
    }
    if (newPhones.length > 0) {
      matchQueries.push(
        service
          .from("contacts")
          .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
          .in("phone", newPhones)
          .eq("is_duplicate", false) as unknown as Promise<{ data: Contact[] | null }>
      );
    }

    const matchResults = await Promise.all(matchQueries);
    const existingMap = new Map<string, Contact>();
    for (const res of matchResults) {
      for (const c of (res.data ?? []) as Contact[]) {
        existingMap.set(c.id, c);
      }
    }

    // Build fast lookup maps: email → contact, phone → contact
    const byEmail = new Map<string, Contact>();
    const byPhone = new Map<string, Contact>();
    for (const c of existingMap.values()) {
      if (c.email) byEmail.set(c.email, c);
      if (c.email_alt) byEmail.set(c.email_alt, c);
      if (c.phone) byPhone.set(c.phone, c);
    }

    let inserted = 0;

    for (const contact of normalizedContacts) {
      // Exact email match → merge
      const emailMatch = contact.email ? byEmail.get(contact.email) : undefined;
      // Exact phone match → merge (only if no email match)
      const phoneMatch = !emailMatch && contact.phone ? byPhone.get(contact.phone) : undefined;
      const match = emailMatch ?? phoneMatch;

      if (match) {
        const merged = mergeContacts(match, contact as Contact);
        await service.from("contacts").update(merged).eq("id", match.id);
        // Update local maps so subsequent contacts in this batch see the merge
        if (merged.email) byEmail.set(merged.email, { ...match, ...merged });
        if (merged.phone) byPhone.set(merged.phone, { ...match, ...merged });
        inserted++;
        continue;
      }

      // No exact match → insert as new
      const { data: newContact, error: insertErr } = await service
        .from("contacts")
        .insert(contact)
        .select("id, email, phone")
        .single();

      if (insertErr || !newContact) continue;
      inserted++;

      // Add to local maps so rest of batch can dedup against it
      if (newContact.email) byEmail.set(newContact.email, { ...contact, id: newContact.id } as Contact);
      if (newContact.phone) byPhone.set(newContact.phone, { ...contact, id: newContact.id } as Contact);
    }

    await service.from("source_documents").update({
      status: "done",
      entities_found: inserted,
      completed_at: new Date().toISOString(),
    }).eq("id", doc.id);

    await service.from("uploads").update({ status: "done" }).eq("id", uploadId);

    await service.from("processing_logs").insert({
      source_document_id: doc.id,
      stage: "deduplicate",
      status: "success",
      message: `Inserted/merged ${inserted} contacts`,
      metadata: { inserted },
    });

    return NextResponse.json({ upload_id: uploadId, document_id: doc.id, inserted, status: "done" });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";

    await service.from("source_documents").update({
      status: "failed",
      error_message: message,
    }).eq("id", doc.id);

    await service.from("uploads").update({ status: "failed" }).eq("id", uploadId);

    await service.from("processing_logs").insert({
      source_document_id: doc.id,
      stage: "extract",
      status: "error",
      message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
