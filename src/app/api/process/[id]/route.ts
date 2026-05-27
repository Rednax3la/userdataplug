import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runExtractionPipeline } from "@/lib/extraction/pipeline";
import { findDuplicates, mergeContacts } from "@/lib/extraction/deduplicator";
import type { Contact } from "@/types";

// Allow up to 60s — works on Pro; free tier will cut at ~10s but UI is already unblocked
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

  // Fetch upload + source document
  const { data: upload } = await service
    .from("uploads")
    .select("*")
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

  // Already processed or currently in-flight — skip
  if (upload.status === "done" || upload.status === "processing") {
    return NextResponse.json({ status: upload.status });
  }

  const { data: doc } = await service
    .from("source_documents")
    .select("*")
    .eq("upload_id", uploadId)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // Mark as processing
  await Promise.all([
    service.from("uploads").update({ status: "processing" }).eq("id", uploadId),
    service.from("source_documents").update({ status: "parsing" }).eq("id", doc.id),
  ]);

  try {
    // Download file from Supabase Storage
    const { data: fileData, error: dlError } = await service.storage
      .from("uploads")
      .download(upload.storage_path);

    if (dlError || !fileData) throw new Error(dlError?.message ?? "Download failed");

    const buffer = await fileData.arrayBuffer();

    await service.from("source_documents").update({ status: "extracting" }).eq("id", doc.id);

    // Run extraction pipeline
    const normalizedContacts = await runExtractionPipeline(
      buffer,
      upload.file_type,
      doc.id,
      process.env.ANTHROPIC_API_KEY
    );

    await service.from("source_documents").update({ status: "deduplicating" }).eq("id", doc.id);

    const { data: existingContacts } = await service
      .from("contacts")
      .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
      .eq("is_duplicate", false);

    const existing = (existingContacts ?? []) as Contact[];
    let inserted = 0;
    const dupPairs: { a: string; b: string; score: number; reasons: string[] }[] = [];

    for (const contact of normalizedContacts) {
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

      const topMatch = matches[0];

      if (topMatch && topMatch.score >= 0.9) {
        const existingContact = existing.find((c) => c.id === topMatch.contact_id);
        if (existingContact) {
          const merged = mergeContacts(existingContact, contact as Contact);
          await service.from("contacts").update(merged).eq("id", existingContact.id);
          Object.assign(existingContact, merged);
          inserted++;
          continue;
        }
      }

      const contactToInsert = { ...contact };

      if (topMatch && topMatch.score >= 0.7) {
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

      if (topMatch && topMatch.score >= 0.7) {
        dupPairs.push({
          a: topMatch.contact_id,
          b: newContact.id,
          score: topMatch.score,
          reasons: topMatch.reasons,
        });
      }

      existing.push({
        ...contactToInsert,
        id: newContact.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Contact);
    }

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
      message: `Inserted ${inserted} contacts, ${dupPairs.length} duplicate pairs flagged`,
      metadata: { inserted, dup_pairs: dupPairs.length },
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
