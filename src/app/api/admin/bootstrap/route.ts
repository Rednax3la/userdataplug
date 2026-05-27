import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/bootstrap
 * Makes the current authenticated user an admin — only works if ZERO admins exist.
 * Safe to call multiple times.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = await createServiceClient();

    // Check if user_profiles table exists
    const { error: tableCheck } = await service
      .from("user_profiles")
      .select("id")
      .limit(1);

    if (tableCheck && (tableCheck.code === "42P01" || tableCheck.message?.includes("does not exist"))) {
      return NextResponse.json({
        error: "Database migration not run yet. Run supabase/migrations/002_user_profiles.sql in Supabase SQL Editor first.",
      }, { status: 503 });
    }

    // Check if any admin already exists
    const { count, error: countError } = await service
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: "An admin already exists. Ask them to approve you via Settings → User Management.",
      }, { status: 403 });
    }

    // Upsert this user as admin
    const { error: upsertError } = await service
      .from("user_profiles")
      .upsert({ id: user.id, email: user.email!, role: "admin", approved: true });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "You are now admin. Redirecting…" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
