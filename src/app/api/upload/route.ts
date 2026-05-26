import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { original_name, storage_path, file_type, file_size } = body;

  if (!original_name || !storage_path || !file_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Create upload record
  const { data: upload, error: uploadError } = await service
    .from("uploads")
    .insert({
      user_id: user.id,
      original_name,
      storage_path,
      file_type,
      file_size: file_size ?? null,
      status: "queued",
    })
    .select()
    .single();

  if (uploadError || !upload) {
    return NextResponse.json({ error: uploadError?.message ?? "Insert failed" }, { status: 500 });
  }

  // Create source document record
  const { data: doc, error: docError } = await service
    .from("source_documents")
    .insert({
      upload_id: upload.id,
      file_name: original_name,
      file_path: storage_path,
      file_type,
      file_size: file_size ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? "Doc insert failed" }, { status: 500 });
  }

  // Log
  await service.from("processing_logs").insert({
    source_document_id: doc.id,
    stage: "parse",
    status: "started",
    message: `File queued: ${original_name}`,
  });

  // Trigger extractor service (fire and forget)
  const extractorUrl = process.env.EXTRACTOR_SERVICE_URL;
  if (extractorUrl) {
    fetch(`${extractorUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Secret": process.env.EXTRACTOR_SERVICE_SECRET ?? "",
      },
      body: JSON.stringify({
        document_id: doc.id,
        upload_id: upload.id,
        storage_path,
        file_type,
        file_name: original_name,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process/complete`,
      }),
    }).catch((e) => console.error("Extractor trigger failed:", e));
  }

  return NextResponse.json({
    upload_id: upload.id,
    document_id: doc.id,
    status: "queued",
  });
}
