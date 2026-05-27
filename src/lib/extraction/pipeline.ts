// ============================================================
// Userplug — Full Extraction Pipeline (pure TypeScript / Node.js)
// Handles PDF, XLSX, XLS, CSV, DOCX — no Python required.
// ============================================================

import {
  extractEmailsFromText,
  extractPhonesFromText,
  normalizeEmail,
  normalizePhone,
  normalizeCountry,
  normalizeName,
  normalizeGender,
  splitFullName,
  countryFromPhone,
} from "./normalizers";
import type { ExtractedEntity } from "@/types";

// ── Column header → field mapping ─────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  // Email
  email: "email",
  "e-mail": "email",
  "email address": "email",
  "emailaddress": "email",
  // Phone
  phone: "phone",
  telephone: "phone",
  mobile: "phone",
  cell: "phone",
  "phone number": "phone",
  "mobile number": "phone",
  "contact no": "phone",
  "contact number": "phone",
  tel: "phone",
  // Names
  "first name": "first_name",
  firstname: "first_name",
  fn: "first_name",
  "given name": "first_name",
  forename: "first_name",
  "last name": "last_name",
  lastname: "last_name",
  surname: "last_name",
  "family name": "last_name",
  ln: "last_name",
  name: "full_name",
  "full name": "full_name",
  fullname: "full_name",
  participant: "full_name",
  member: "full_name",
  staff: "full_name",
  employee: "full_name",
  contact: "full_name",
  delegate: "full_name",
  // Gender
  gender: "gender",
  sex: "gender",
  // Country / location
  country: "country",
  nation: "country",
  nationality: "country",
  city: "city",
  town: "city",
  location: "city",
  county: "city",
  // Professional
  company: "company",
  organisation: "company",
  organization: "company",
  employer: "company",
  firm: "company",
  institution: "company",
  entity: "company",
  title: "role",
  role: "role",
  position: "role",
  designation: "role",
  rank: "role",
  occupation: "occupation",
  profession: "occupation",
  job: "occupation",
};

function mapHeader(raw: string): string | null {
  const clean = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return HEADER_MAP[clean] ?? null;
}

// ── Table extraction ────────────────────────────────────────────────────

export function extractFromTable(
  rows: (string | null | undefined)[][]
): ExtractedEntity[] {
  if (!rows || rows.length < 2) return [];

  // Find header row — try first 3 rows
  let headerIdx = 0;
  let colMap: Record<number, string> = {};

  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const candidate: Record<number, string> = {};
    for (let j = 0; j < rows[i].length; j++) {
      const mapped = mapHeader(String(rows[i][j] ?? ""));
      if (mapped) candidate[j] = mapped;
    }
    if (Object.keys(candidate).length >= 2) {
      headerIdx = i;
      colMap = candidate;
      break;
    }
  }

  if (Object.keys(colMap).length === 0) return [];

  const entities: ExtractedEntity[] = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some(Boolean)) continue;

    const entity: Partial<ExtractedEntity> & {
      confidence_score: number;
      flags: string[];
      extraction_method: "deterministic";
    } = {
      confidence_score: 0.75,
      flags: [],
      extraction_method: "deterministic",
    };

    for (const [colIdxStr, field] of Object.entries(colMap)) {
      const colIdx = Number(colIdxStr);
      if (colIdx >= row.length) continue;
      const val = String(row[colIdx] ?? "").trim();
      if (!val || ["none", "null", "n/a", "-", ""].includes(val.toLowerCase())) continue;
      (entity as Record<string, unknown>)[field] = val;
    }

    // Inline email/phone scan across all cells
    if (!entity.email) {
      for (const cell of row) {
        const emails = extractEmailsFromText(String(cell ?? ""));
        if (emails.length > 0) { entity.email = emails[0]; break; }
      }
    }
    if (!entity.phone) {
      for (const cell of row) {
        const phones = extractPhonesFromText(String(cell ?? ""));
        if (phones.length > 0) { entity.phone = phones[0]; break; }
      }
    }

    const hasIdentity = entity.email || entity.phone || entity.full_name || entity.first_name;
    if (!hasIdentity) continue;

    if (entity.email && entity.phone) entity.confidence_score = 0.9;
    else if (entity.email || entity.phone) entity.confidence_score = 0.8;

    entities.push(entity as ExtractedEntity);
  }

  return entities;
}

// ── Text extraction ────────────────────────────────────────────────────

export function extractFromText(text: string): ExtractedEntity[] {
  const emails = extractEmailsFromText(text);
  const phones = extractPhonesFromText(text);

  if (emails.length === 0 && phones.length === 0) return [];
  if (emails.length > 50 || phones.length > 50) return []; // too many — defer to AI

  const entities: ExtractedEntity[] = [];
  const maxLen = Math.max(emails.length, phones.length);

  for (let i = 0; i < maxLen; i++) {
    const entity: ExtractedEntity = {
      confidence_score: 0.5,
      flags: ["no_name_context"],
      extraction_method: "deterministic",
    };
    if (i < emails.length) entity.email = emails[i];
    if (i < phones.length) entity.phone = phones[i];
    entities.push(entity);
  }

  return entities;
}

// ── File parsers ────────────────────────────────────────────────────────

export async function parsePDF(buffer: ArrayBuffer): Promise<ExtractedEntity[]> {
  const entities: ExtractedEntity[] = [];
  try {
    // Dynamic import — pdf-parse is a heavy module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (input: Buffer) => Promise<{ text: string; numpages: number }>;
    const data = await pdfParse(Buffer.from(buffer));
    const text = data.text ?? "";

    // First try table-like extraction from structured text
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const tableRows = lines.map((l) => l.split(/\s{2,}|\t/)); // split on 2+ spaces or tab
    const tableEntities = extractFromTable(tableRows);

    if (tableEntities.length > 0) {
      entities.push(...tableEntities);
    } else {
      // Fall back to inline text extraction
      entities.push(...extractFromText(text));
    }
  } catch (e) {
    console.error("PDF parse error:", e);
  }
  return entities;
}

export async function parseExcel(buffer: ArrayBuffer): Promise<ExtractedEntity[]> {
  const entities: ExtractedEntity[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const wb = XLSX.read(Buffer.from(buffer), { type: "buffer" });

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        raw: false,
      }) as string[][];

      entities.push(...extractFromTable(rows));
    }
  } catch (e) {
    console.error("Excel parse error:", e);
  }
  return entities;
}

export async function parseCSV(buffer: ArrayBuffer): Promise<ExtractedEntity[]> {
  const entities: ExtractedEntity[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Papa = require("papaparse") as typeof import("papaparse");
    const text = new TextDecoder("utf-8").decode(buffer);
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    entities.push(...extractFromTable(result.data as string[][]));
  } catch (e) {
    console.error("CSV parse error:", e);
  }
  return entities;
}

export async function parseDOCX(buffer: ArrayBuffer): Promise<ExtractedEntity[]> {
  const entities: ExtractedEntity[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    const text = result.value ?? "";
    entities.push(...extractFromText(text));
  } catch (e) {
    console.error("DOCX parse error:", e);
  }
  return entities;
}

// ── AI enrichment ───────────────────────────────────────────────────────

const AI_SYSTEM = `You are a precise data extraction assistant. Extract real contact/person information from documents.
Rules:
- Extract ONLY what is explicitly present. Never guess or hallucinate.
- Focus on people, not organizations.
- Return ONLY a valid JSON array. No markdown, no explanation.`;

const AI_USER = `Extract all person/contact records from this text.

Return a JSON array of objects with these optional fields:
- first_name, last_name, full_name
- email, phone
- gender (M/F/Unknown)
- country, city
- company, role, occupation
- confidence_score (0.0-1.0, required)
- flags (string array)

TEXT:
{text}

Return only the JSON array:`;

export async function aiExtract(
  textChunks: string[],
  apiKey: string
): Promise<ExtractedEntity[]> {
  if (!apiKey || textChunks.length === 0) return [];

  const entities: ExtractedEntity[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    for (const chunk of textChunks) {
      if (!chunk.trim() || chunk.length < 30) continue;

      try {
        const msg = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: AI_SYSTEM,
          messages: [{ role: "user", content: AI_USER.replace("{text}", chunk) }],
        });

        const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim().replace(/`/g, "");
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (!match) continue;

        const parsed = JSON.parse(match[0]) as unknown[];
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const e = item as Record<string, unknown>;
          const hasIdentity = e.email || e.phone || e.full_name || e.first_name;
          if (!hasIdentity) continue;

          entities.push({
            ...e,
            confidence_score: Math.max(0, Math.min(1, Number(e.confidence_score ?? 0.65))),
            flags: Array.isArray(e.flags) ? (e.flags as string[]) : [],
            extraction_method: "ai",
          } as ExtractedEntity);
        }
      } catch {
        // Skip failed chunks
      }
    }
  } catch (e) {
    console.error("AI extraction error:", e);
  }

  return entities;
}

// ── Normalizer pass ─────────────────────────────────────────────────────

export function normalizeEntities(
  entities: ExtractedEntity[],
  sourceDocId: string
): Omit<import("@/types").Contact, "id" | "created_at" | "updated_at">[] {
  return entities.map((entity) => {
    const email = normalizeEmail(entity.email);
    const emailAlt = normalizeEmail(entity.email_alt);
    const phone = normalizePhone(entity.phone);
    const country = normalizeCountry(entity.country) ?? countryFromPhone(normalizePhone(entity.phone));
    const gender = normalizeGender(entity.gender);

    let firstName = normalizeName(entity.first_name);
    let lastName = normalizeName(entity.last_name);
    let fullName = normalizeName(entity.full_name);

    if (fullName && !firstName && !lastName) {
      const split = splitFullName(fullName);
      firstName = split.first_name;
      lastName = split.last_name;
    }
    if (!fullName && (firstName || lastName)) {
      fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    }

    return {
      email,
      email_alt: emailAlt,
      phone,
      phone_raw: entity.phone ?? null,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      gender,
      country,
      country_raw: entity.country ?? null,
      city: normalizeName(entity.city) ?? null,
      address: entity.address ?? null,
      company: entity.company ?? null,
      role: entity.role ?? null,
      occupation: entity.occupation ?? null,
      age: entity.age ?? null,
      estimated_age: entity.estimated_age ?? null,
      social_links: entity.social_links ?? null,
      interests: entity.interests ?? null,
      tags: entity.tags ?? null,
      purchase_signals: null,
      invoice_history: null,
      primary_source_id: sourceDocId,
      all_source_ids: [sourceDocId],
      field_sources: {},
      confidence_score: entity.confidence_score,
      flags: entity.flags ?? [],
      is_flagged: (entity.flags ?? []).length > 0,
      opted_out: false,
      opted_out_at: null,
      consent_source: null,
      canonical_id: null,
      is_duplicate: false,
      merged_from: [],
    };
  });
}

// ── Main entry point ────────────────────────────────────────────────────

export async function runExtractionPipeline(
  buffer: ArrayBuffer,
  fileType: string,
  sourceDocId: string,
  anthropicApiKey?: string
): Promise<ReturnType<typeof normalizeEntities>> {
  const ext = fileType.toLowerCase().replace(".", "");

  let raw: ExtractedEntity[] = [];

  if (ext === "pdf") {
    raw = await parsePDF(buffer);
  } else if (ext === "xlsx" || ext === "xls") {
    raw = await parseExcel(buffer);
  } else if (ext === "csv") {
    raw = await parseCSV(buffer);
  } else if (ext === "docx") {
    raw = await parseDOCX(buffer);
  }

  // If deterministic extraction was weak and AI key is available,
  // run AI on text that yielded nothing
  if (raw.length === 0 && anthropicApiKey && ext === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (input: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(Buffer.from(buffer));
      const text = data.text ?? "";
      const chunks = chunkText(text, 6000);
      raw = await aiExtract(chunks, anthropicApiKey);
    } catch { /* ignore */ }
  }

  return normalizeEntities(raw, sourceDocId);
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    // Try to break at a newline
    const nl = text.lastIndexOf("\n", end);
    if (nl > start + size / 2) end = nl;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
