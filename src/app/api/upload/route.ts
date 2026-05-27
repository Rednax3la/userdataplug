import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

  // 1. Create upload record (queued — not yet processing)
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

  // 2. Create source document record
  const { data: doc, error: docError } = await service
    .from("source_documents")
    .insert({
      upload_id: upload.id,
      file_name: original_name,
      file_path: storage_path,
      file_type,
      file_size: file_size ?? null,
      status: "queued",
    })
    .select()
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? "Doc insert failed" }, { status: 500 });
  }

  // Return immediately — client will fire-and-forget the /api/process/[id] call
  return NextResponse.json({
    upload_id: upload.id,
    document_id: doc.id,
    status: "queued",
  });
}
