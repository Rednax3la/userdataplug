import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/bootstrap
 * Makes the current authenticated user an admin — only works if ZERO admins exist.
 * Safe to call multiple times: once an admin exists, it becomes a no-op.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = await createServiceClient();

  // Check if any admin already exists
  const { count } = await service
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "An admin already exists. Ask them to approve you." }, { status: 403 });
  }

  // Upsert this user as admin
  const { error } = await service
    .from("user_profiles")
    .upsert({ id: user.id, email: user.email!, role: "admin", approved: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, message: "You are now admin. Reload the page." });
}
