import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runExtractionPipeline } from "@/lib/extraction/pipeline";
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
  if (upload.status === "done") return NextResponse.json({ status: "done" });

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
    // 1. Download file
    const { data: fileData, error: dlError } = await service.storage
      .from("uploads")
      .download(upload.storage_path);

    if (dlError || !fileData) throw new Error(dlError?.message ?? "Download failed");

    const buffer = await fileData.arrayBuffer();

    await service.from("source_documents").update({ status: "extracting" }).eq("id", doc.id);

    // 2. Extract contacts
    const normalizedContacts = await runExtractionPipeline(
      buffer,
      upload.file_type,
      doc.id,
      process.env.ANTHROPIC_API_KEY
    );

    if (normalizedContacts.length === 0) {
      await Promise.all([
        service.from("source_documents").update({
          status: "done", entities_found: 0, completed_at: new Date().toISOString(),
        }).eq("id", doc.id),
        service.from("uploads").update({ status: "done" }).eq("id", uploadId),
      ]);
      return NextResponse.json({ upload_id: uploadId, inserted: 0, status: "done" });
    }

    await service.from("source_documents").update({ status: "deduplicating" }).eq("id", doc.id);

    // 3. Single DB query to find all existing contacts that share an email or phone
    const newEmails = normalizedContacts.map(c => c.email).filter((e): e is string => !!e);
    const newPhones = normalizedContacts.map(c => c.phone).filter((p): p is string => !!p);

    const [emailMatches, phoneMatches] = await Promise.all([
      newEmails.length > 0
        ? service.from("contacts")
            .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
            .in("email", newEmails)
            .eq("is_duplicate", false)
        : Promise.resolve({ data: [] }),
      newPhones.length > 0
        ? service.from("contacts")
            .select("id, email, email_alt, phone, full_name, country, confidence_score, primary_source_id, all_source_ids, merged_from, field_sources")
            .in("phone", newPhones)
            .eq("is_duplicate", false)
        : Promise.resolve({ data: [] }),
    ]);

    // Build O(1) lookup maps
    const byEmail = new Map<string, Contact>();
    const byPhone = new Map<string, Contact>();
    for (const c of [...(emailMatches.data ?? []), ...(phoneMatches.data ?? [])] as Contact[]) {
      if (c.email) byEmail.set(c.email, c);
      if (c.email_alt) byEmail.set(c.email_alt, c);
      if (c.phone) byPhone.set(c.phone, c);
    }

    // 4. Split into: contacts to merge into existing vs contacts to insert fresh
    const toInsert: typeof normalizedContacts = [];
    const toMerge: { existingId: string; merged: Partial<Contact> }[] = [];

    for (const contact of normalizedContacts) {
      const match =
        (contact.email ? byEmail.get(contact.email) : undefined) ??
        (contact.phone ? byPhone.get(contact.phone) : undefined);

      if (match) {
        toMerge.push({ existingId: match.id, merged: mergeContacts(match, contact as Contact) });
      } else {
        toInsert.push(contact);
        // Register in local maps so duplicates within this batch are caught too
        if (contact.email) byEmail.set(contact.email, contact as unknown as Contact);
        if (contact.phone) byPhone.set(contact.phone, contact as unknown as Contact);
      }
    }

    // 5. Batch insert all new contacts in ONE call (huge speedup vs per-row inserts)
    let insertedCount = toMerge.length; // merges count as processed
    if (toInsert.length > 0) {
      // Supabase has a ~1000 row limit per insert; chunk if needed
      const CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { error } = await service.from("contacts").insert(chunk);
        if (!error) insertedCount += chunk.length;
      }
    }

    // 6. Apply merges in parallel (typically few; most contacts are net-new)
    if (toMerge.length > 0) {
      await Promise.all(
        toMerge.map(({ existingId, merged }) =>
          service.from("contacts").update(merged).eq("id", existingId)
        )
      );
    }

    // 7. Mark done
    await Promise.all([
      service.from("source_documents").update({
        status: "done",
        entities_found: insertedCount,
        completed_at: new Date().toISOString(),
      }).eq("id", doc.id),
      service.from("uploads").update({ status: "done" }).eq("id", uploadId),
      service.from("processing_logs").insert({
        source_document_id: doc.id,
        stage: "deduplicate",
        status: "success",
        message: `Inserted ${toInsert.length} new contacts, merged ${toMerge.length}`,
        metadata: { inserted: toInsert.length, merged: toMerge.length },
      }),
    ]);

    return NextResponse.json({
      upload_id: uploadId,
      document_id: doc.id,
      inserted: toInsert.length,
      merged: toMerge.length,
      status: "done",
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";

    await Promise.all([
      service.from("source_documents").update({
        status: "failed",
        error_message: message,
      }).eq("id", doc.id),
      service.from("uploads").update({ status: "failed" }).eq("id", uploadId),
      service.from("processing_logs").insert({
        source_document_id: doc.id,
        stage: "extract",
        status: "error",
        message,
      }),
    ]);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
