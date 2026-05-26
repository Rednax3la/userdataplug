import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/types";

// CSV helpers
function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSVRow(fields: string[], obj: Record<string, unknown>): string {
  return fields.map((f) => escapeCSV(obj[f])).join(",");
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "csv";
  const excludeOptedOut = sp.get("exclude_opted_out") !== "false";
  const minConfidence = sp.get("min_confidence") ? parseFloat(sp.get("min_confidence")!) : 0;

  let query = supabase
    .from("contacts")
    .select("*")
    .eq("is_duplicate", false)
    .order("created_at", { ascending: false });

  if (excludeOptedOut) query = query.eq("opted_out", false);
  if (minConfidence > 0) query = query.gte("confidence_score", minConfidence);

  // Stream all records (max 100k)
  const { data, error } = await query.limit(100000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contacts = (data ?? []) as Contact[];

  if (format === "meta") {
    // Meta / Facebook Custom Audience format
    // https://www.facebook.com/business/help/170456843145568
    const headers = ["fn", "ln", "email", "phone", "country", "gender"];
    const rows = [
      headers.join(","),
      ...contacts.map((c) =>
        toCSVRow([], {
          fn: c.first_name ?? "",
          ln: c.last_name ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          country: (c.country ?? "").toLowerCase(),
          gender: c.gender === "M" ? "m" : c.gender === "F" ? "f" : "",
        })
          .split(",") // re-escape
          .join(",")
      ),
    ];

    // Actually build properly
    const metaRows = [
      headers.join(","),
      ...contacts.map((c) => {
        const row = {
          fn: c.first_name ?? "",
          ln: c.last_name ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          country: (c.country ?? "").toLowerCase(),
          gender: c.gender === "M" ? "m" : c.gender === "F" ? "f" : "",
        };
        return headers.map((h) => escapeCSV(row[h as keyof typeof row])).join(",");
      }),
    ];

    return new NextResponse(metaRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="meta-audience-${Date.now()}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    // Import xlsx dynamically (server-side only)
    const XLSX = await import("xlsx");

    const wb = XLSX.utils.book_new();

    // Sheet 1: Contacts
    const contactFields = [
      "full_name", "first_name", "last_name", "email", "email_alt", "phone",
      "gender", "country", "city", "address", "company", "role", "occupation",
      "age", "confidence_score", "tags", "flags", "opted_out", "created_at",
    ];

    const wsData = [
      contactFields,
      ...contacts.map((c) =>
        contactFields.map((f) => {
          const val = c[f as keyof Contact];
          if (Array.isArray(val)) return val.join("; ");
          return val ?? "";
        })
      ),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");

    // Sheet 2: Opted out
    const optedOut = contacts.filter((c) => c.opted_out);
    if (optedOut.length > 0) {
      const optedOutData = [
        ["full_name", "email", "phone", "opted_out_at"],
        ...optedOut.map((c) => [c.full_name ?? "", c.email ?? "", c.phone ?? "", c.opted_out_at ?? ""]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(optedOutData), "Opted Out");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="userplug-export-${Date.now()}.xlsx"`,
      },
    });
  }

  // Default: CSV
  const fields = [
    "full_name", "first_name", "last_name", "email", "email_alt", "phone",
    "gender", "country", "city", "address", "company", "role", "occupation",
    "age", "estimated_age", "confidence_score", "tags", "opted_out",
    "primary_source_id", "created_at",
  ];

  const lines = [
    fields.join(","),
    ...contacts.map((c) =>
      fields
        .map((f) => {
          const val = c[f as keyof Contact];
          if (Array.isArray(val)) return escapeCSV(val.join("; "));
          return escapeCSV(val);
        })
        .join(",")
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="userplug-export-${Date.now()}.csv"`,
    },
  });
}
