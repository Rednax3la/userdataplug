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
//   ANTHROPIC_API_KEY  (required for AI extraction of unstructured files)
// ============================================================

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

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
if (!ANTHROPIC_API_KEY) {
  console.warn("⚠️   ANTHROPIC_API_KEY not set — AI extraction disabled. Most files will yield 0 contacts.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// pdf-parse v1.x exports a function directly
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer, opts?: object) => Promise<{ text: string; numpages: number }>;
const XLSX = require("xlsx") as typeof import("xlsx");
const Papa = require("papaparse") as typeof import("papaparse");
const mammoth = require("mammoth") as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase().replace(/\s+/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  // Strip everything except digits and leading +
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (cleaned.length < 7) return null;

  // E.164 max is 15 digits — reject anything longer (concatenated numbers / garbage)
  const justDigits = cleaned.replace(/^\+/, "");
  if (justDigits.length > 15) return null;

  // Already has country code with +
  if (cleaned.startsWith("+")) return cleaned;

  // 254XXXXXXXXX (Kenya without +)
  if (justDigits.startsWith("254") && justDigits.length === 12) return "+" + justDigits;

  // 07XXXXXXXX or 01XXXXXXXX (Kenya local)
  if (justDigits.startsWith("0") && justDigits.length === 10) return "+254" + justDigits.slice(1);

  // 10-digit number with no prefix — assume Kenya
  if (justDigits.length === 10) return "+254" + justDigits.slice(1);

  // International without + (e.g. 447911123456)
  if (justDigits.length >= 11 && justDigits.length <= 15) return "+" + justDigits;

  return null;
}

const COUNTRY_MAP: Record<string, string> = {
  kenya: "KE", uganda: "UG", tanzania: "TZ", nigeria: "NG",
  ghana: "GH", "south africa": "ZA", ethiopia: "ET", rwanda: "RW",
  zambia: "ZM", zimbabwe: "ZW", malawi: "MW", botswana: "BW",
  mozambique: "MZ", senegal: "SN", "ivory coast": "CI", cameroon: "CM",
  uk: "GB", "united kingdom": "GB", usa: "US", "united states": "US",
  india: "IN", china: "CN", france: "FR", germany: "DE",
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
  email: "email", "e-mail": "email", "email address": "email", "email_address": "email",
  phone: "phone", telephone: "phone", mobile: "phone", cell: "phone",
  "phone number": "phone", "mobile number": "phone", "contact no": "phone",
  "contact number": "phone", tel: "phone", "tel.": "phone", "mobile no": "phone",
  "first name": "first_name", firstname: "first_name", fn: "first_name",
  "given name": "first_name", forename: "first_name", "given names": "first_name",
  "last name": "last_name", lastname: "last_name", surname: "last_name",
  "family name": "last_name", ln: "last_name",
  name: "full_name", "full name": "full_name", fullname: "full_name",
  "full_name": "full_name", participant: "full_name", member: "full_name",
  contact: "full_name", delegate: "full_name", attendee: "full_name",
  "contact name": "full_name", "attendee name": "full_name", officer: "full_name",
  staff: "full_name", employee: "full_name", "staff name": "full_name",
  gender: "gender", sex: "gender",
  country: "country", nationality: "country", nation: "country",
  city: "city", town: "city", location: "city", "city/town": "city",
  company: "company", organisation: "company", organization: "company",
  employer: "company", institution: "company", "org name": "company",
  "organisation name": "company", "organization name": "company",
  role: "role", title: "role", position: "role", designation: "role",
  occupation: "role", "job title": "role", "job_title": "role",
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
  // Must have at least email or phone — name-only rows waste tokens and pollute the DB
  }).filter((r) => r.email || r.phone);
}

// ── Text extractors (for AI fallback) ─────────────────────────────────────

function excelToText(buf: Buffer): string {
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const lines: string[] = [];
    for (const sn of wb.SheetNames.slice(0, 5)) {
      const aoa: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
      if (aoa.length === 0) continue;
      lines.push(`[Sheet: ${sn}]`);
      // Include headers and first 200 rows
      for (const row of aoa.slice(0, 200)) {
        const cells = row.map(String).map(c => c.trim()).filter(Boolean);
        if (cells.length > 0) lines.push(cells.join(" | "));
      }
    }
    return lines.join("\n");
  } catch { return ""; }
}

// ── Parsers ────────────────────────────────────────────────────────────────

async function parsePDF(buf: Buffer): Promise<{ rows: Row[]; rawText: string }> {
  try {
    const result = await pdfParse(buf);
    const text = result.text ?? "";
    if (!text || text.trim().length < 10) return { rows: [], rawText: "" };

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const splitRows = lines.map((l) => l.split(/\t|\s{3,}/));

    // Try table extraction first
    if (splitRows.length > 1) {
      const possible = rowsToEntities(splitRows[0], splitRows.slice(1));
      if (possible.length > 0) return { rows: possible, rawText: text };
    }

    // Inline email/phone extraction (fast, no AI needed)
    const entities: Row[] = [];
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const phoneRe = /(?:\+?(?:254|255|256|260|263|27|234|233|251|250|44|1)[\s\-]?)[0-9][\d\s\-]{7,13}/g;
    let match;
    const seenEmails = new Set<string>();
    while ((match = emailRe.exec(text)) !== null) {
      const em = match[0].toLowerCase().replace(/[.,;]+$/, "");
      if (!seenEmails.has(em)) { seenEmails.add(em); entities.push({ email: em }); }
    }
    while ((match = phoneRe.exec(text)) !== null) {
      const ph = match[0].replace(/[\s\-]/g, "");
      entities.push({ phone: ph });
    }
    // Return both inline matches AND rawText so AI can fill gaps
    return { rows: entities, rawText: text };
  } catch (e) {
    process.stdout.write(`[pdf-parse error: ${(e as Error).message.slice(0,60)}] `);
    return { rows: [], rawText: "" };
  }
}

async function parseExcel(buf: Buffer): Promise<{ rows: Row[]; rawText: string }> {
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const all: Row[] = [];
    for (const sn of wb.SheetNames) {
      // raw: true avoids scientific notation on large phone numbers (e.g. 254712345678 → 2.54E+11)
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: true });
      if (aoa.length < 2) continue;
      // Convert each cell to full-precision string
      const stringify = (v: unknown) =>
        v === null || v === undefined ? "" :
        typeof v === "number" && Number.isInteger(v) ? String(v) : String(v);
      const headers = aoa[0].map(stringify);
      const dataRows = aoa.slice(1).map((r) => (r as unknown[]).map(stringify));
      all.push(...rowsToEntities(headers, dataRows));
    }
    const rawText = all.length === 0 ? excelToText(buf) : "";
    return { rows: all, rawText };
  } catch { return { rows: [], rawText: excelToText(buf) }; }
}

async function parseCSV(buf: Buffer): Promise<{ rows: Row[]; rawText: string }> {
  try {
    const text = buf.toString("utf-8");
    const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const rows = result.data as string[][];
    if (rows.length < 2) return { rows: [], rawText: text.slice(0, 8000) };
    const entities = rowsToEntities(rows[0].map(String), rows.slice(1).map((r) => r.map(String)));
    return { rows: entities, rawText: entities.length === 0 ? text.slice(0, 8000) : "" };
  } catch { return { rows: [], rawText: "" }; }
}

async function parseDOCX(buf: Buffer): Promise<{ rows: Row[]; rawText: string }> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value || value.trim().length < 20) return { rows: [], rawText: "" };
    const entities: Row[] = [];
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    let match;
    while ((match = emailRe.exec(value)) !== null) {
      entities.push({ email: match[0].toLowerCase() });
    }
    return { rows: entities, rawText: entities.length === 0 ? value : "" };
  } catch { return { rows: [], rawText: "" }; }
}

// ── AI extraction ──────────────────────────────────────────────────────────

let aiCallCount = 0;
let aiClient: import("@anthropic-ai/sdk").default | null = null;

async function getAI() {
  if (aiClient) return aiClient;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  aiClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return aiClient;
}

async function aiExtractChunk(text: string, fileName: string, chunkNum: number): Promise<Row[]> {
  const trimmed = text.trim();
  if (trimmed.length < 30) return [];

  aiCallCount++;
  // Rate limiting: 1s pause every 5 calls
  if (aiCallCount % 5 === 0) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  const client = await getAI();
  const chunkLabel = chunkNum > 0 ? ` (chunk ${chunkNum + 1})` : "";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Extract contacts from this document${chunkLabel}: "${fileName}"

Rules:
- ONLY include people who have at least an email address OR a phone number
- Do NOT include name-only entries with no email and no phone
- Phone: keep raw number including country prefix (e.g. 254712345678 or +254712345678)
- Return ONLY a JSON array, no markdown, no explanation

Fields: full_name, email, phone, gender (M/F), country, company, role

Example: [{"full_name":"John Doe","email":"j@x.com","phone":"+254722000000","company":"UN","role":"Officer"}]
If no qualifying contacts: []

TEXT:
${trimmed}`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];
    const parsed = JSON.parse(arrayMatch[0]);
    return Array.isArray(parsed) ? parsed as Row[] : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("rate") || msg.includes("529")) {
      await new Promise((r) => setTimeout(r, 8000));
      return aiExtractChunk(text, fileName, chunkNum); // retry once
    }
    process.stdout.write(`[AI error: ${msg.slice(0, 60)}] `);
    return [];
  }
}

// Split text into chunks and run AI on each, deduplicate by email/phone/name
async function aiExtract(text: string, fileName: string): Promise<Row[]> {
  if (!ANTHROPIC_API_KEY) return [];
  const trimmed = text.trim();
  if (trimmed.length < 30) return [];

  const CHUNK_SIZE = 6000;
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += CHUNK_SIZE) {
    chunks.push(trimmed.slice(i, i + CHUNK_SIZE));
  }

  const allRows: Row[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const rows = await aiExtractChunk(chunks[i], fileName, i);
    for (const row of rows) {
      const key = (row.email ?? "") + "|" + (row.phone ?? "") + "|" + (row.full_name ?? "");
      if (key !== "||" && !seenKeys.has(key)) {
        seenKeys.add(key);
        allRows.push(row);
      }
    }
  }

  return allRows;
}

// ── Normalize a row to a DB-ready contact object ───────────────────────────

function normalize(row: Row, sourceId: string): Record<string, unknown> | null {
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone);
  const fullName = (row.full_name ?? "").trim() || null;
  const firstName = (row.first_name ?? "").trim() || null;
  const lastName = (row.last_name ?? "").trim() || null;

  // Require at least email or phone — name-only rows aren't useful contacts
  if (!email && !phone) return null;

  const composedName = fullName ??
    (firstName && lastName ? `${firstName} ${lastName}` : firstName ?? lastName ?? null);

  const rawGender = (row.gender ?? "").toUpperCase();
  let gender: string | null = null;
  if (rawGender.startsWith("F") || rawGender === "FEMALE") gender = "F";
  else if (rawGender.startsWith("M") || rawGender === "MALE") gender = "M";

  return {
    email,
    phone,
    phone_raw: row.phone ?? null,
    first_name: firstName,
    last_name: lastName,
    full_name: composedName,
    gender,
    country: normalizeCountry(row.country),
    country_raw: row.country ?? null,
    city: (row.city ?? "").trim() || null,
    company: (row.company ?? "").trim() || null,
    role: (row.role ?? "").trim() || null,
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
      .maybeSingle();
    if (data) return data.id as string;
  }
  if (phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (data) return data.id as string;
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // --force: reprocess all files even if already marked done
  const force = process.argv.includes("--force");

  console.log("🔍  Scanning:", DATA_DIR);
  if (force) console.log("⚡  Force mode: reprocessing all files");

  if (!fs.existsSync(DATA_DIR)) {
    console.error("❌  Data directory not found:", DATA_DIR);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(DATA_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".pdf", ".xls", ".xlsx", ".csv", ".docx"].includes(ext);
  });

  console.log(`📁  Found ${allFiles.length} files to process`);
  console.log(`🤖  AI extraction: ${ANTHROPIC_API_KEY ? "ENABLED" : "DISABLED"}\n`);

  let totalInserted = 0;
  let totalMerged = 0;
  let aiUsed = 0;
  let filesDone = 0;

  for (const fileName of allFiles) {
    const filePath = path.join(DATA_DIR, fileName);
    const ext = path.extname(fileName).toLowerCase().slice(1);
    const buf = fs.readFileSync(filePath);
    filesDone++;

    const display = fileName.length > 55 ? fileName.slice(0, 55) + "…" : fileName;
    process.stdout.write(`[${filesDone}/${allFiles.length}] ${display}... `);

    // Create source document record (upsert by file_name to allow re-runs)
    const { data: existing } = await supabase
      .from("source_documents")
      .select("id, status")
      .eq("file_name", fileName)
      .maybeSingle();

    // Skip files already fully processed (unless --force)
    if (!force && existing?.status === "done") {
      process.stdout.write("SKIP\n");
      continue;
    }

    let docId: string;
    if (existing) {
      docId = existing.id as string;
    } else {
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
      if (!docRec) { process.stdout.write("⚠️  doc insert failed\n"); continue; }
      docId = docRec.id as string;
    }

    // Parse with structured extractor first
    let rows: Row[] = [];
    let rawText = "";
    let usedAI = false;

    if (ext === "pdf") {
      const r = await parsePDF(buf);
      rows = r.rows; rawText = r.rawText;
    } else if (ext === "xls" || ext === "xlsx") {
      const r = await parseExcel(buf);
      rows = r.rows; rawText = r.rawText;
    } else if (ext === "csv") {
      const r = await parseCSV(buf);
      rows = r.rows; rawText = r.rawText;
    } else if (ext === "docx") {
      const r = await parseDOCX(buf);
      rows = r.rows; rawText = r.rawText;
    }

    // AI extraction — runs on ALL files with text content
    // For structured files that already found rows, AI supplements (finds more)
    // For files with 0 rows, AI is the primary extractor
    if (ANTHROPIC_API_KEY) {
      if (!rawText && (ext === "xls" || ext === "xlsx")) rawText = excelToText(buf);
      if (!rawText && ext === "csv") rawText = buf.toString("utf-8");

      if (rawText.trim().length > 30) {
        const aiRows = await aiExtract(rawText, fileName);
        if (aiRows.length > 0) {
          usedAI = true;
          // Merge AI rows with structured rows (deduplicate by email/name)
          const existingKeys = new Set(rows.map(r => (r.email ?? "") + "|" + (r.full_name ?? "")));
          for (const ar of aiRows) {
            const key = (ar.email ?? "") + "|" + (ar.full_name ?? "");
            if (!existingKeys.has(key)) { rows.push(ar); existingKeys.add(key); }
          }
        }
      }
    }

    if (rows.length === 0) {
      await supabase.from("source_documents")
        .update({ status: "done", entities_found: 0 })
        .eq("id", docId);
      process.stdout.write("0 contacts\n");
      continue;
    }

    if (usedAI) aiUsed++;

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
        const update: Record<string, unknown> = {};
        const fields = ["full_name", "first_name", "last_name", "gender", "country", "city", "company", "role"] as const;

        const { data: curr } = await supabase
          .from("contacts")
          .select(fields.join(",") + ",all_source_ids")
          .eq("id", existingId)
          .maybeSingle();

        if (curr) {
          const currRec = curr as Record<string, unknown>;
          for (const f of fields) {
            if (!currRec[f] && contact[f]) update[f] = contact[f];
          }
          const sourceIds = [...new Set([...((curr.all_source_ids as string[]) ?? []), docId])];
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

    await supabase.from("source_documents").update({
      status: "done",
      entities_found: inserted + merged,
      completed_at: new Date().toISOString(),
    }).eq("id", docId);

    const aiTag = usedAI ? " (AI)" : "";
    process.stdout.write(`${inserted} inserted, ${merged} merged${aiTag}\n`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅  Done. ${filesDone} files processed.`);
  console.log(`   Inserted : ${totalInserted}`);
  console.log(`   Merged   : ${totalMerged}`);
  console.log(`   AI used  : ${aiUsed} files`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
