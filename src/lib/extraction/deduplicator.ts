// ============================================================
// Userplug — Deduplication Engine
// ============================================================

import { Contact, ExtractedEntity } from "@/types";
import { normalizeEmail, normalizePhone, nameSimilarity } from "./normalizers";

export interface MatchResult {
  contact_id: string;
  score: number;
  reasons: string[];
}

/**
 * Find duplicate candidates for a given extracted entity.
 * Returns matches sorted by score descending.
 */
export function findDuplicates(
  entity: ExtractedEntity,
  existing: Contact[]
): MatchResult[] {
  const results: MatchResult[] = [];

  const entityEmail = normalizeEmail(entity.email);
  const entityPhone = normalizePhone(entity.phone);
  const entityName = entity.full_name?.toLowerCase().trim() ?? null;

  for (const contact of existing) {
    let score = 0;
    const reasons: string[] = [];

    // Email exact match — very high confidence
    const contactEmail = normalizeEmail(contact.email);
    if (entityEmail && contactEmail && entityEmail === contactEmail) {
      score += 0.9;
      reasons.push("email_exact");
    }

    // Alt email match
    const contactEmailAlt = normalizeEmail(contact.email_alt);
    if (entityEmail && contactEmailAlt && entityEmail === contactEmailAlt) {
      score += 0.85;
      reasons.push("email_alt_exact");
    }

    // Phone exact match
    const contactPhone = normalizePhone(contact.phone);
    if (entityPhone && contactPhone && entityPhone === contactPhone) {
      score += 0.85;
      reasons.push("phone_exact");
    }

    // Fuzzy name match — only meaningful when some other signal is present
    const contactName = contact.full_name?.toLowerCase().trim() ?? null;
    if (entityName && contactName) {
      const sim = nameSimilarity(entityName, contactName);
      if (sim >= 0.9) {
        score += 0.5 * sim;
        reasons.push("fuzzy_name_high");
      } else if (sim >= 0.75) {
        score += 0.3 * sim;
        reasons.push("fuzzy_name_medium");
      }
    }

    // Country match — small boost, never standalone
    if (
      entity.country &&
      contact.country &&
      entity.country.toUpperCase() === contact.country.toUpperCase()
    ) {
      if (reasons.length > 0) {
        score += 0.05;
      }
    }

    // Only flag as candidate if score is meaningful
    if (score >= 0.7 && reasons.length > 0) {
      results.push({ contact_id: contact.id, score, reasons });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Merge two contacts — keeps higher-confidence field values.
 * Returns the merged record (does not write to DB).
 */
export function mergeContacts(
  primary: Contact,
  secondary: Contact
): Partial<Contact> {
  const merged: Partial<Contact> = { ...primary };

  const primaryScore = primary.confidence_score ?? 0;
  const secondaryScore = secondary.confidence_score ?? 0;

  // For each nullable field, prefer the one with higher confidence
  // or the non-null value if only one exists
  const fields: (keyof Contact)[] = [
    "email",
    "email_alt",
    "phone",
    "first_name",
    "last_name",
    "full_name",
    "gender",
    "country",
    "city",
    "address",
    "company",
    "role",
    "occupation",
    "age",
    "estimated_age",
  ];

  const fieldSources = { ...(primary.field_sources ?? {}) };

  for (const field of fields) {
    const pVal = primary[field];
    const sVal = secondary[field];

    if (!pVal && sVal) {
      (merged as Record<string, unknown>)[field] = sVal;
      if (secondary.primary_source_id) {
        fieldSources[field] = secondary.primary_source_id;
      }
    } else if (pVal && sVal && secondaryScore > primaryScore) {
      // Secondary has higher confidence — prefer its value
      (merged as Record<string, unknown>)[field] = sVal;
      if (secondary.primary_source_id) {
        fieldSources[field] = secondary.primary_source_id;
      }
    }
  }

  // Merge arrays
  merged.tags = [...new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])])];
  merged.interests = [
    ...new Set([...(primary.interests ?? []), ...(secondary.interests ?? [])]),
  ];
  merged.all_source_ids = [
    ...new Set([
      ...(primary.all_source_ids ?? []),
      ...(secondary.all_source_ids ?? []),
    ]),
  ];
  merged.merged_from = [
    ...(primary.merged_from ?? []),
    secondary.id,
  ];
  merged.field_sources = fieldSources;

  // Take max confidence
  merged.confidence_score = Math.max(primaryScore, secondaryScore);

  return merged;
}

/**
 * Determine if an entity looks like a real person (not a company/org).
 */
export function looksLikePerson(entity: ExtractedEntity): boolean {
  const name = entity.full_name ?? `${entity.first_name ?? ""} ${entity.last_name ?? ""}`.trim();

  if (!name && !entity.email && !entity.phone) return false;

  // Company indicators
  const companyPatterns = /\b(ltd|limited|inc|corp|company|co\.|llc|pvt|pty|group|agency|ministry|department|dept|association|union|council|bureau|authority|commission|institute|university|college)\b/i;
  if (companyPatterns.test(name)) return false;

  return true;
}
