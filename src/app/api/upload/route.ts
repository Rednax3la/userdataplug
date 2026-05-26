import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runExtractionPipeline } from "@/lib/extraction/pipeline";
import { findDuplicates } from "@/lib/extraction/deduplicator";
import type { Contact } from "@/types";

// Vercel: allow up to 60s for extraction
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { original_name, storage_path, file_type, file_size } = body;

  if (!original_name || !storage_path || !file_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const service = await createServiceClient();

  // 1. Create upload record
  const { data: upload, error: uploadError } = await service
    .from("uploads")
    .insert({
      user_id: user.id,
      original_name,
      storage_path,
      file_type,
      file_size: file_size ?? null,
      status: "processing",
    })
    .select()
    .single();

  if (uploadError || !upload) {
    return NextResponse.json({ error: uploadError?.message ?? "Insert failed" }, { status: 500 });
  }

  // 2. Create source document record
  const { data: doc, error: docError } = await service
    .from("source_documents")
    .insert({
      upload_id: upload.id,
      file_name: original_name,
      file_path: storage_path,
      file_type,
      file_size: file_size ?? null,
      status: "parsing",
    })
    .select()
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? "Doc insert failed" }, { status: 500 });
  }

  try {
    // 3. Download file from Supabase Storage
    const { data: fileData, error: dlError } = await service.storage
      .from("uploads")
      .download(storage_path);

    if (dlError || !fileData) throw new Error(dlError?.message ?? "Download failed");

    const buffer = await fileData.arrayBuffer();

    // 4. Update status → extracting
    await service.from("source_documents").update({ status: "extracting" }).eq("id", doc.id);

    // 5. Run extraction pipeline (pure TS — no Python needed)
    const normalizedContacts = await runExtractionPipeline(
      buffer,
      file_type,
      doc.id,
      process.env.ANTHROPIC_API_KEY
    );

    // 6. Dedup + insert
    await service.from("source_documents").update({ status: "deduplicating" }).eq("id", doc.id);

    const { data: existingContacts } = await service
      .from("contacts")
      .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
      .eq("is_duplicate", false);

    const existing = (existingContacts ?? []) as Contact[];
    let inserted = 0;
    const dupPairs: { a: string; b: string; score: number; reasons: string[] }[] = [];

    for (const contact of normalizedContacts) {
      // Find duplicates before inserting
      const matches = findDuplicates(
        {
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          full_name: contact.full_name ?? undefined,
          country: contact.country ?? undefined,
          confidence_score: contact.confidence_score ?? 0.5,
          flags: contact.flags ?? [],
          extraction_method: "deterministic",
        },
        existing
      );

      const contactToInsert = { ...contact };

      if (matches.length > 0 && matches[0].score >= 0.85) {
        contactToInsert.is_flagged = true;
        contactToInsert.flags = [...(contactToInsert.flags ?? []), "potential_duplicate"];
      }

      const { data: newContact, error: insertErr } = await service
        .from("contacts")
        .insert(contactToInsert)
        .select("id")
        .single();

      if (insertErr || !newContact) continue;
      inserted++;

      if (matches.length > 0 && matches[0].score >= 0.85) {
        dupPairs.push({
          a: matches[0].contact_id,
          b: newContact.id,
          score: matches[0].score,
          reasons: matches[0].reasons,
        });
      }

      existing.push({ ...contactToInsert, id: newContact.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Contact);
    }

    // 7. Insert duplicate candidates
    if (dupPairs.length > 0) {
      await service.from("duplicate_candidates").insert(
        dupPairs.map((p) => ({
          contact_a: p.a,
          contact_b: p.b,
          match_score: p.score,
          match_reasons: p.reasons,
          status: "pending",
        }))
      );
    }

    // 8. Mark done
    await service.from("source_documents").update({
      status: "done",
      entities_found: inserted,
      completed_at: new Date().toISOString(),
    }).eq("id", doc.id);

    await service.from("uploads").update({ status: "done" }).eq("id", upload.id);

    await service.from("processing_logs").insert({
      source_document_id: doc.id,
      stage: "deduplicate",
      status: "success",
      message: `Inserted ${inserted} contacts, ${dupPairs.length} duplicate pairs flagged`,
      metadata: { inserted, dup_pairs: dupPairs.length },
    });

    return NextResponse.json({
      upload_id: upload.id,
      document_id: doc.id,
      inserted,
      status: "done",
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";

    await service.from("source_documents").update({
      status: "failed",
      error_message: message,
    }).eq("id", doc.id);

    await service.from("uploads").update({ status: "failed" }).eq("id", upload.id);

    await service.from("processing_logs").insert({
      source_document_id: doc.id,
      stage: "extract",
      status: "error",
      message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
