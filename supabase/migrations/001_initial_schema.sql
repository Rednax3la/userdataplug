-- ============================================================
-- Userplug — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- UPLOADS
-- Tracks every file a user uploads through the dashboard
-- ============================================================
create table if not exists uploads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  original_name   text not null,
  storage_path    text not null,
  file_type       text not null,   -- pdf | xls | xlsx | csv | docx
  file_size       bigint,
  status          text not null default 'uploaded',
  -- uploaded | queued | processing | done | failed
  created_at      timestamptz default now()
);

-- ============================================================
-- SOURCE DOCUMENTS
-- Each file produces one source_document record.
-- One upload can produce multiple source_documents (e.g. zip)
-- ============================================================
create table if not exists source_documents (
  id               uuid primary key default gen_random_uuid(),
  upload_id        uuid references uploads(id) on delete cascade,
  file_name        text not null,
  file_path        text not null,
  file_type        text not null,
  file_size        bigint,
  page_count       integer,
  status           text not null default 'pending',
  -- pending | parsing | extracting | normalizing | deduplicating | done | failed
  entities_found   integer default 0,
  error_message    text,
  processing_meta  jsonb,
  created_at       timestamptz default now(),
  completed_at     timestamptz
);

-- ============================================================
-- CONTACTS
-- The unified, deduplicated, enriched person/entity table.
-- This is the primary output of the pipeline.
-- ============================================================
create table if not exists contacts (
  id                  uuid primary key default gen_random_uuid(),

  -- Core identity
  email               text,
  email_alt           text,
  phone               text,         -- normalized E.164 e.g. +254722123456
  phone_raw           text,         -- original as extracted
  first_name          text,
  last_name           text,
  full_name           text,
  gender              text,         -- M | F | Unknown

  -- Location
  country             text,         -- ISO alpha-2 e.g. KE
  country_raw         text,         -- as extracted
  city                text,
  address             text,

  -- Professional
  company             text,
  role                text,
  occupation          text,

  -- Demographics
  age                 integer,
  estimated_age       integer,

  -- Enrichment
  social_links        jsonb,        -- {"linkedin": "...", "twitter": "..."}
  interests           text[],
  tags                text[],
  purchase_signals    jsonb,
  invoice_history     jsonb,

  -- Provenance — where did this data come from?
  primary_source_id   uuid references source_documents(id),
  all_source_ids      uuid[],
  field_sources       jsonb,        -- {"email": "doc_uuid", "phone": "doc_uuid2"}

  -- Confidence & quality
  confidence_score    real check (confidence_score between 0 and 1),
  flags               text[],       -- ["uncertain_name", "no_email", "ocr_extracted"]
  is_flagged          boolean not null default false,

  -- Compliance
  opted_out           boolean not null default false,
  opted_out_at        timestamptz,
  consent_source      text,

  -- Deduplication
  canonical_id        uuid,         -- points to the kept record after merge
  is_duplicate        boolean not null default false,
  merged_from         uuid[],       -- IDs of records merged into this one

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- DUPLICATE CANDIDATES
-- Pairs of contacts flagged as potential duplicates for review
-- ============================================================
create table if not exists duplicate_candidates (
  id              uuid primary key default gen_random_uuid(),
  contact_a       uuid not null references contacts(id) on delete cascade,
  contact_b       uuid not null references contacts(id) on delete cascade,
  match_score     real not null check (match_score between 0 and 1),
  match_reasons   text[],         -- ["email_exact", "phone_exact", "fuzzy_name"]
  status          text not null default 'pending',
  -- pending | merged | kept_separate | dismissed
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz default now(),
  constraint no_self_pair check (contact_a <> contact_b)
);

-- ============================================================
-- PROCESSING LOGS
-- Audit trail for every step in the extraction pipeline
-- ============================================================
create table if not exists processing_logs (
  id                   uuid primary key default gen_random_uuid(),
  source_document_id   uuid references source_documents(id) on delete cascade,
  stage                text not null,  -- parse | extract | normalize | deduplicate
  status               text not null,  -- started | success | error
  message              text,
  metadata             jsonb,
  duration_ms          integer,
  created_at           timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists contacts_email_idx       on contacts (lower(email))     where email is not null;
create index if not exists contacts_phone_idx       on contacts (phone)             where phone is not null;
create index if not exists contacts_country_idx     on contacts (country);
create index if not exists contacts_created_at_idx  on contacts (created_at desc);
create index if not exists contacts_canonical_idx   on contacts (canonical_id)      where canonical_id is not null;
create index if not exists contacts_flagged_idx     on contacts (is_flagged)        where is_flagged = true;
create index if not exists contacts_opted_out_idx   on contacts (opted_out)         where opted_out = true;
create index if not exists dup_status_idx           on duplicate_candidates (status);
create index if not exists src_doc_status_idx       on source_documents (status);
create index if not exists uploads_user_idx         on uploads (user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_updated_at
  before update on contacts
  for each row execute procedure set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- All authenticated users can manage their own data.
-- Contacts are shared across the organization (all auth users).
-- ============================================================
alter table uploads             enable row level security;
alter table source_documents    enable row level security;
alter table contacts            enable row level security;
alter table duplicate_candidates enable row level security;
alter table processing_logs     enable row level security;

-- Uploads: own records only
create policy "uploads_select" on uploads for select to authenticated using (auth.uid() = user_id);
create policy "uploads_insert" on uploads for insert to authenticated with check (auth.uid() = user_id);
create policy "uploads_update" on uploads for update to authenticated using (auth.uid() = user_id);

-- Source documents: all authenticated users can read/write
create policy "source_docs_all" on source_documents for all to authenticated using (true) with check (true);

-- Contacts: shared across org
create policy "contacts_all" on contacts for all to authenticated using (true) with check (true);

-- Duplicate candidates: shared
create policy "dup_all" on duplicate_candidates for all to authenticated using (true) with check (true);

-- Processing logs: read-only for users, write via service role
create policy "logs_select" on processing_logs for select to authenticated using (true);
create policy "logs_insert" on processing_logs for insert to authenticated using (true) with check (true);

-- ============================================================
-- STORAGE BUCKET
-- Run this separately if not created in dashboard
-- ============================================================
-- insert into storage.buckets (id, name, public)
-- values ('uploads', 'uploads', false);

-- create policy "Uploads bucket auth" on storage.objects
--   for all to authenticated
--   using (bucket_id = 'uploads' and auth.uid()::text = (storage.foldername(name))[1]);
