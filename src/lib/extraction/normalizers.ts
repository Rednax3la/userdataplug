// ============================================================
// Userplug — Data Normalizers
// All deterministic normalization happens here before DB insert
// ============================================================

/**
 * Normalize a phone number to E.164 format.
 * Handles common East African formats (254, 256, 255, 263 prefixes).
 */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;

  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d+]/g, "");

  // Remove leading + for processing
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }

  // Remove leading zeros
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // East African / common country code handling
  // If starts with 07xx or 01xx (Kenya local format) → prepend 254
  if (/^0[17]\d{8}$/.test(digits)) {
    digits = "254" + digits.slice(1);
  }

  // If 9 digits starting with 7xx or 1xx (Kenya without 0)
  if (/^[71]\d{8}$/.test(digits)) {
    digits = "254" + digits;
  }

  // Basic validation: must be 10-15 digits
  if (digits.length < 10 || digits.length > 15) return null;

  return "+" + digits;
}

/**
 * Normalize an email address.
 */
export function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  // Basic RFC 5322 simplified check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Normalize a country code.
 * Handles full names (Kenya → KE) and common aliases.
 */
const COUNTRY_MAP: Record<string, string> = {
  kenya: "KE",
  uganda: "UG",
  tanzania: "TZ",
  ethiopia: "ET",
  rwanda: "RW",
  ghana: "GH",
  nigeria: "NG",
  southafrica: "ZA",
  "south africa": "ZA",
  zimbabwe: "ZW",
  zambia: "ZM",
  malawi: "MW",
  mozambique: "MZ",
  botswana: "BW",
  cameroon: "CM",
  senegal: "SN",
  egypt: "EG",
  morocco: "MA",
  // Add more as needed
};

export function normalizeCountry(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const clean = raw.trim();

  // Already ISO alpha-2
  if (/^[A-Z]{2}$/.test(clean)) return clean;
  if (/^[a-z]{2}$/.test(clean)) return clean.toUpperCase();

  // Try mapping from full name
  const lower = clean.toLowerCase().replace(/\s+/g, " ");
  if (COUNTRY_MAP[lower]) return COUNTRY_MAP[lower];

  // Fallback: just uppercase it if it's short
  if (clean.length <= 3) return clean.toUpperCase();

  return clean; // return as-is if unknown
}

/**
 * Normalize a person's name to title case.
 */
export function normalizeName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const clean = raw.trim();
  if (!clean) return null;

  return clean
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Normalize gender field.
 */
export function normalizeGender(raw: string | undefined | null): "M" | "F" | "Unknown" {
  if (!raw) return "Unknown";
  const clean = raw.trim().toLowerCase();
  if (["m", "male", "man", "boy"].includes(clean)) return "M";
  if (["f", "female", "woman", "girl"].includes(clean)) return "F";
  return "Unknown";
}

/**
 * Attempt to split a full name into first/last.
 * Returns best-effort split with low confidence if uncertain.
 */
export function splitFullName(fullName: string): {
  first_name: string | null;
  last_name: string | null;
  confidence: number;
} {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first_name: null, last_name: null, confidence: 0 };
  if (parts.length === 1) return { first_name: parts[0], last_name: null, confidence: 0.4 };
  if (parts.length === 2)
    return { first_name: parts[0], last_name: parts[1], confidence: 0.85 };

  // 3+ parts — first word is first name, rest is last name (common in Africa)
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
    confidence: 0.7,
  };
}

/**
 * Extract emails from a block of text using regex.
 */
export function extractEmailsFromText(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

/**
 * Extract phone numbers from a block of text.
 * Returns raw strings; call normalizePhone for each.
 */
export function extractPhonesFromText(text: string): string[] {
  const patterns = [
    /\+?254\s?\d{3}\s?\d{3}\s?\d{3}/g,     // Kenya +254
    /\+?256\s?\d{3}\s?\d{3}\s?\d{3}/g,     // Uganda
    /\+?255\s?\d{3}\s?\d{3}\s?\d{3}/g,     // Tanzania
    /0[17]\d{2}\s?\d{3}\s?\d{3}/g,          // Local 07xx / 01xx
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    found.push(...matches);
  }

  return [...new Set(found.map((p) => p.replace(/\s/g, "")))];
}

/**
 * Infer ISO alpha-2 country code from E.164 phone prefix.
 * Covers all country calling codes.
 */
const PHONE_PREFIX_MAP: [string, string][] = [
  // Longer prefixes first (most specific)
  ["1242", "BS"], ["1246", "BB"], ["1264", "AI"], ["1268", "AG"],
  ["1284", "VG"], ["1340", "VI"], ["1345", "KY"], ["1441", "BM"],
  ["1473", "GD"], ["1649", "TC"], ["1664", "MS"], ["1670", "MP"],
  ["1671", "GU"], ["1684", "AS"], ["1721", "SX"], ["1758", "LC"],
  ["1767", "DM"], ["1784", "VC"], ["1787", "PR"], ["1809", "DO"],
  ["1868", "TT"], ["1869", "KN"], ["1876", "JM"],
  ["254", "KE"], ["255", "TZ"], ["256", "UG"], ["257", "BI"],
  ["258", "MZ"], ["260", "ZM"], ["261", "MG"], ["262", "RE"],
  ["263", "ZW"], ["264", "NA"], ["265", "MW"], ["266", "LS"],
  ["267", "BW"], ["268", "SZ"], ["269", "KM"], ["27", "ZA"],
  ["290", "SH"], ["291", "ER"], ["297", "AW"], ["298", "FO"],
  ["299", "GL"],
  ["212", "MA"], ["213", "DZ"], ["216", "TN"], ["218", "LY"],
  ["220", "GM"], ["221", "SN"], ["222", "MR"], ["223", "ML"],
  ["224", "GN"], ["225", "CI"], ["226", "BF"], ["227", "NE"],
  ["228", "TG"], ["229", "BJ"], ["230", "MU"], ["231", "LR"],
  ["232", "SL"], ["233", "GH"], ["234", "NG"], ["235", "TD"],
  ["236", "CF"], ["237", "CM"], ["238", "CV"], ["239", "ST"],
  ["240", "GQ"], ["241", "GA"], ["242", "CG"], ["243", "CD"],
  ["244", "AO"], ["245", "GW"], ["246", "IO"], ["247", "AC"],
  ["248", "SC"], ["249", "SD"], ["250", "RW"], ["251", "ET"],
  ["252", "SO"], ["253", "DJ"],
  ["20", "EG"], ["30", "GR"], ["31", "NL"], ["32", "BE"],
  ["33", "FR"], ["34", "ES"], ["36", "HU"], ["39", "IT"],
  ["40", "RO"], ["41", "CH"], ["43", "AT"], ["44", "GB"],
  ["45", "DK"], ["46", "SE"], ["47", "NO"], ["48", "PL"],
  ["49", "DE"], ["51", "PE"], ["52", "MX"], ["53", "CU"],
  ["54", "AR"], ["55", "BR"], ["56", "CL"], ["57", "CO"],
  ["58", "VE"], ["60", "MY"], ["61", "AU"], ["62", "ID"],
  ["63", "PH"], ["64", "NZ"], ["65", "SG"], ["66", "TH"],
  ["7", "RU"], ["81", "JP"], ["82", "KR"], ["84", "VN"],
  ["86", "CN"], ["90", "TR"], ["91", "IN"], ["92", "PK"],
  ["93", "AF"], ["94", "LK"], ["95", "MM"], ["98", "IR"],
  ["1", "US"],
];

export function countryFromPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.startsWith("+") ? e164.slice(1) : e164;
  for (const [prefix, code] of PHONE_PREFIX_MAP) {
    if (digits.startsWith(prefix)) return code;
  }
  return null;
}

/**
 * Simple Levenshtein distance for fuzzy name matching.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

export function nameSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}
