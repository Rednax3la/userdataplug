import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { mergeContacts } from "@/lib/extraction/deduplicator";
import type { Contact } from "@/types";

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { pair_id, action, keep_id, merge_id } = body;

  const service = await createServiceClient();

  if (action === "merged" && keep_id && merge_id) {
    // Fetch both contacts
    const { data: contacts } = await service
      .from("contacts")
      .select("*")
      .in("id", [keep_id, merge_id]);

    if (!contacts || contacts.length < 2) {
      return NextResponse.json({ error: "Contacts not found" }, { status: 404 });
    }

    const primary = contacts.find((c: Contact) => c.id === keep_id)!;
    const secondary = contacts.find((c: Contact) => c.id === merge_id)!;

    const merged = mergeContacts(primary, secondary);

    // Update primary with merged data
    await service.from("contacts").update(merged).eq("id", keep_id);

    // Mark secondary as duplicate
    await service
      .from("contacts")
      .update({ is_duplicate: true, canonical_id: keep_id })
      .eq("id", merge_id);

    // Mark pair as merged
    await service
      .from("duplicate_candidates")
      .update({ status: "merged", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", pair_id);

    return NextResponse.json({ ok: true, merged_into: keep_id });
  }

  // kept_separate or dismissed
  const { error } = await service
    .from("duplicate_candidates")
    .update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", pair_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
