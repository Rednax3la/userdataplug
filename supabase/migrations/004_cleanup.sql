-- ============================================================
-- Userplug — Data Cleanup Queries
-- Run each block separately in Supabase SQL Editor.
-- Preview with SELECT before running DELETE.
-- ============================================================

-- ── 1. Delete contacts with no email, no phone, and no company ────────────
-- These are pure name-only (or completely empty) records with no contact value.
-- Preview first:
/*
SELECT id, full_name, country, created_at
FROM contacts
WHERE email IS NULL
  AND phone IS NULL
  AND (company IS NULL OR company = '')
ORDER BY created_at;
*/

DELETE FROM contacts
WHERE email IS NULL
  AND phone IS NULL
  AND (company IS NULL OR company = '');


-- ── 2. Delete contacts with no email, no phone, no company, and no role ───
-- More aggressive: also removes contacts that only have a name + role/title.
-- (Uncomment if you want this level of cleanup too)
/*
DELETE FROM contacts
WHERE email IS NULL
  AND phone IS NULL
  AND (company IS NULL OR company = '')
  AND (role IS NULL OR role = '');
*/


-- ── 3. Remove exact duplicate email records (keep most complete one) ───────
-- Keeps the record with the most non-null fields; deletes the rest.
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY email
        ORDER BY
          -- Prefer records with more data (phone, name, company all filled in)
          (CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN full_name IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN company IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN country IS NOT NULL THEN 1 ELSE 0 END) DESC,
          confidence_score DESC,
          created_at ASC
      ) AS rn
    FROM contacts
    WHERE email IS NOT NULL
  ) ranked
  WHERE rn > 1
);


-- ── 4. Remove exact duplicate phone records (keep most complete one) ───────
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY phone
        ORDER BY
          (CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN full_name IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN company IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN country IS NOT NULL THEN 1 ELSE 0 END) DESC,
          confidence_score DESC,
          created_at ASC
      ) AS rn
    FROM contacts
    WHERE phone IS NOT NULL
  ) ranked
  WHERE rn > 1
);


-- ── 5. Count what's left ──────────────────────────────────────────────────
SELECT
  COUNT(*) AS total_contacts,
  COUNT(email) AS with_email,
  COUNT(phone) AS with_phone,
  COUNT(*) FILTER (WHERE email IS NOT NULL AND phone IS NOT NULL) AS with_both,
  COUNT(*) FILTER (WHERE email IS NULL AND phone IS NULL) AS name_only
FROM contacts;
