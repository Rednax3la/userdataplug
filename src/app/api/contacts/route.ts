import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ContactsQueryParams } from "@/types";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const params: ContactsQueryParams = {
    page: parseInt(sp.get("page") ?? "0"),
    per_page: Math.min(parseInt(sp.get("per_page") ?? "25"), 100),
    search: sp.get("search") ?? undefined,
    country: sp.get("country") ?? undefined,
    gender: sp.get("gender") ?? undefined,
    min_confidence: sp.get("min_confidence") ? parseFloat(sp.get("min_confidence")!) : undefined,
    sort_by: (sp.get("sort_by") as keyof import("@/types").Contact) ?? "created_at",
    sort_dir: (sp.get("sort_dir") as "asc" | "desc") ?? "desc",
  };

  const from = (params.page ?? 0) * (params.per_page ?? 25);
  const to = from + (params.per_page ?? 25) - 1;

  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("is_duplicate", false)
    .order(params.sort_by ?? "created_at", { ascending: params.sort_dir === "asc" })
    .range(from, to);

  if (params.search) {
    query = query.or(
      `full_name.ilike.%${params.search}%,email.ilike.%${params.search}%,phone.ilike.%${params.search}%`
    );
  }
  if (params.country) query = query.eq("country", params.country);
  if (params.gender) query = query.eq("gender", params.gender);
  if (params.min_confidence !== undefined) {
    query = query.gte("confidence_score", params.min_confidence);
  }

  const { data, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    total: count ?? 0,
    page: params.page ?? 0,
    per_page: params.per_page ?? 25,
    total_pages: Math.ceil((count ?? 0) / (params.per_page ?? 25)),
  });
}
