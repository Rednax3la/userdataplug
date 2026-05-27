#!/usr/bin/env tsx
// ============================================================
// Userplug — Seeding Script
// Processes all files in the Combined batch data folder and
// seeds extracted contacts into the Supabase database.
//
// Usage:
//   cd userdataplug
//   npx tsx scripts/seed.ts
//
// Requires .env.local with:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY  (optional — used for AI fallback on unstructured text)
// ============================================================

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.join(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_DIR = path.join(__dirname, "../../Userdata/Combined batch data");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Lazy-load pipeline (avoids Next.js module issues) ──────────────────────
// We duplicate the key extraction logic here using the same deps so the script
// runs standalone without Next.js.

const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
const XLSX = require("xlsx") as typeof import("xlsx");
const Papa = require("papaparse") as typeof import("papaparse");
const mammoth = require("mammoth") as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };

// ── Normalizers (inline — mirrors src/lib/extraction/normalizers.ts) ───────

function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase().replace(/\s+/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return "+254" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("254")) return "+" + digits;
  if (digits.length === 10) return "+254" + digits.slice(1);
  return digits.length >= 10 ? "+" + digits : null;
}

const COUNTRY_MAP: Record<string, string> = {
  kenya: "KE", uganda: "UG", tanzania: "TZ", nigeria: "NG",
  ghana: "GH", "south africa": "ZA", ethiopia: "ET", rwanda: "RW",
  zambia: "ZM", zimbabwe: "ZW", malawi: "MW", botswana: "BW",
  uk: "GB", "united kingdom": "GB", usa: "US", "united states": "US",
};

function normalizeCountry(raw?: string | null): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (COUNTRY_MAP[lower]) return COUNTRY_MAP[lower];
  if (/^[A-Z]{2}$/.test(raw.trim())) return raw.trim().toUpperCase();
  return null;
}

// ── Header map ─────────────────────────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  email: "email", "e-mail": "email", "email address": "email",
  phone: "phone", telephone: "phone", mobile: "phone", cell: "phone",
  "phone number": "phone", "mobile number": "phone", "contact no": "phone",
  "first name": "first_name", firstname: "first_name", fn: "first_name",
  "last name": "last_name", lastname: "last_name", surname: "last_name", ln: "last_name",
  name: "full_name", "full name": "full_name", fullname: "full_name",
  participant: "full_name", member: "full_name", contact: "full_name", delegate: "full_name",
  gender: "gender", sex: "gender",
  country: "country", nationality: "country", nation: "country",
  city: "city", town: "city", location: "city",
  company: "company", organisation: "company", organization: "company", employer: "company",
  role: "role", title: "role", position: "role", designation: "role",
};

interface Row { [key: string]: string }

function mapHeaders(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((h, i) => {
    const k = HEADER_MAP[h.toLowerCase().trim()];
    if (k) map[i] = k;
  });
  return map;
}

function rowsToEntities(headers: string[], rows: string[][]): Row[] {
  const hmap = mapHeaders(headers);
  if (Object.keys(hmap).length === 0) return [];
  return rows.map((row) => {
    const obj: Row = {};
    Object.entries(hmap).forEach(([idx, field]) => {
      const val = row[parseInt(idx)]?.trim();
      if (val) obj[field] = val;
    });
    return obj;
  }).filter((r) => r.email || r.phone || r.full_name);
}

// ── Parsers ────────────────────────────────────────────────────────────────

async function parsePDF(buf: Buffer): Promise<Row[]> {
  try {
    const { text } = await pdfParse(buf);
    if (!text || text.trim().length < 20) return [];
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l) => l.split(/\t|\s{2,}/));
    if (rows.length > 1) {
      const possible = rowsToEntities(rows[0], rows.slice(1));
      if (possible.length > 0) return possible;
    }
    // Inline extraction
    const entities: Row[] = [];
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const phoneRe = /(?:\+?254|0)[0-9]{9}/g;
    let match;
    const seen = new Set<string>();
    while ((match = emailRe.exec(text)) !== null) {
      const em = match[0].toLowerCase();
      if (!seen.has(em)) { seen.add(em); entities.push({ email: em }); }
    }
    while ((match = phoneRe.exec(text)) !== null) {
      entities.push({ phone: match[0] });
    }
    return entities;
  } catch { return []; }
}

async function parseExcel(buf: Buffer): Promise<Row[]> {
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const all: Row[] = [];
    for (const sn of wb.SheetNames) {
      const aoa: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
      if (aoa.length < 2) continue;
      const headers = aoa[0].map(String);
      all.push(...rowsToEntities(headers, aoa.slice(1).map((r) => r.map(String))));
    }
    return all;
  } catch { return []; }
}

async function parseCSV(buf: Buffer): Promise<Row[]> {
  try {
    const text = buf.toString("utf-8");
    const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const rows = result.data as string[][];
    if (rows.length < 2) return [];
    return rowsToEntities(rows[0].map(String), rows.slice(1).map((r) => r.map(String)));
  } catch { return []; }
}

async function parseDOCX(buf: Buffer): Promise<Row[]> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value || value.trim().length < 20) return [];
    const entities: Row[] = [];
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    let match;
    while ((match = emailRe.exec(value)) !== null) {
      entities.push({ email: match[0].toLowerCase() });
    }
    return entities;
  } catch { return []; }
}

// ── AI fallback for unstructured content ───────────────────────────────────

async function aiExtract(text: string): Promise<Row[]> {
  if (!ANTHROPIC_API_KEY || text.trim().length < 50) return [];
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Extract all person contact records from the text below. Return ONLY a JSON array of objects with fields: full_name, email, phone, gender, country, company, role. Omit fields that are absent. If no contacts, return [].

TEXT:
${text.slice(0, 4000)}`,
      }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as Row[];
  } catch { return []; }
}

// ── Normalize a row to a DB-ready contact object ───────────────────────────

function normalize(row: Row, sourceId: string): Record<string, unknown> | null {
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone);
  const fullName = (row.full_name ?? "").trim() || null;
  const firstName = (row.first_name ?? "").trim() || null;
  const lastName = (row.last_name ?? "").trim() || null;

  if (!email && !phone && !fullName && !firstName) return null;

  const composedName = fullName ??
    (firstName && lastName ? `${firstName} ${lastName}` : firstName ?? lastName ?? null);

  return {
    email,
    phone,
    phone_raw: row.phone ?? null,
    first_name: firstName,
    last_name: lastName,
    full_name: composedName,
    gender: row.gender?.toUpperCase().startsWith("F") ? "F" :
            row.gender?.toUpperCase().startsWith("M") ? "M" : null,
    country: normalizeCountry(row.country),
    country_raw: row.country ?? null,
    city: row.city ?? null,
    company: row.company ?? null,
    role: row.role ?? null,
    confidence_score: email ? 0.8 : phone ? 0.7 : 0.5,
    primary_source_id: sourceId,
    all_source_ids: [sourceId],
    is_duplicate: false,
    is_flagged: false,
    opted_out: false,
    flags: [],
  };
}

// ── Dedup check ────────────────────────────────────────────────────────────

async function alreadyExists(email: string | null, phone: string | null): Promise<string | null> {
  if (email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", email)
      .limit(1)
      .single();
    if (data) return data.id as string;
  }
  if (phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .single();
    if (data) return data.id as string;
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍  Scanning:", DATA_DIR);

  if (!fs.existsSync(DATA_DIR)) {
    console.error("❌  Data directory not found:", DATA_DIR);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(DATA_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".pdf", ".xls", ".xlsx", ".csv", ".docx"].includes(ext);
  });

  console.log(`📁  Found ${allFiles.length} files to process\n`);

  let totalInserted = 0;
  let totalMerged = 0;
  let totalSkipped = 0;
  let filesDone = 0;

  for (const fileName of allFiles) {
    const filePath = path.join(DATA_DIR, fileName);
    const ext = path.extname(fileName).toLowerCase().slice(1);
    const buf = fs.readFileSync(filePath);
    filesDone++;

    process.stdout.write(`[${filesDone}/${allFiles.length}] ${fileName.slice(0, 60)}... `);

    // Create a source document record
    const { data: docRec } = await supabase
      .from("source_documents")
      .insert({
        upload_id: null,
        file_name: fileName,
        file_path: `local/${fileName}`,
        file_type: ext,
        file_size: buf.length,
        status: "parsing",
      })
      .select("id")
      .single();

    if (!docRec) {
      process.stdout.write("⚠️  doc insert failed\n");
      continue;
    }

    const docId = docRec.id as string;

    // Parse
    let rows: Row[] = [];
    if (ext === "pdf") rows = await parsePDF(buf);
    else if (ext === "xls" || ext === "xlsx") rows = await parseExcel(buf);
    else if (ext === "csv") rows = await parseCSV(buf);
    else if (ext === "docx") rows = await parseDOCX(buf);

    // AI fallback if nothing found and file is not huge
    if (rows.length === 0 && buf.length < 2_000_000) {
      let text = "";
      try {
        if (ext === "pdf") { const r = await pdfParse(buf); text = r.text; }
        else if (ext === "docx") { const r = await mammoth.extractRawText({ buffer: buf }); text = r.value; }
      } catch { /* ignore */ }
      if (text.trim().length > 50) rows = await aiExtract(text);
    }

    if (rows.length === 0) {
      await supabase.from("source_documents").update({ status: "done", entities_found: 0 }).eq("id", docId);
      process.stdout.write("0 contacts\n");
      continue;
    }

    // Normalize + upsert
    let inserted = 0;
    let merged = 0;

    for (const row of rows) {
      const contact = normalize(row, docId);
      if (!contact) continue;

      const existingId = await alreadyExists(
        contact.email as string | null,
        contact.phone as string | null
      );

      if (existingId) {
        // Merge — update any null fields in existing record with new data
        const update: Record<string, unknown> = {};
        const fields = ["full_name", "first_name", "last_name", "gender", "country", "city", "company", "role"] as const;
        // Get current record
        const { data: curr } = await supabase
          .from("contacts")
          .select(fields.join(",") + ",all_source_ids")
          .eq("id", existingId)
          .single();

        if (curr) {
          for (const f of fields) {
            if (!curr[f] && contact[f]) update[f] = contact[f];
          }
          // Merge source ids
          const sourceIds = [...new Set([...(curr.all_source_ids ?? []), docId])];
          update.all_source_ids = sourceIds;
          if (Object.keys(update).length > 1) {
            await supabase.from("contacts").update(update).eq("id", existingId);
          }
        }
        merged++;
      } else {
        const { error } = await supabase.from("contacts").insert(contact);
        if (!error) inserted++;
      }
    }

    totalInserted += inserted;
    totalMerged += merged;
    totalSkipped += rows.length - inserted - merged;

    await supabase.from("source_documents").update({
      status: "done",
      entities_found: inserted + merged,
      completed_at: new Date().toISOString(),
    }).eq("id", docId);

    process.stdout.write(`${inserted} inserted, ${merged} merged\n`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅  Done. ${filesDone} files processed.`);
  console.log(`   Inserted : ${totalInserted}`);
  console.log(`   Merged   : ${totalMerged}`);
  console.log(`   Skipped  : ${totalSkipped} (no usable data)`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
