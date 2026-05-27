-- ============================================================
-- Userplug — Storage Bucket Setup
-- Run this in Supabase SQL Editor
-- ============================================================

-- Create the uploads bucket if it doesn't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  52428800,  -- 50 MB per file
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Allow any authenticated user to upload files
create policy "uploads_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'uploads');

-- Allow any authenticated user to read/download files
create policy "uploads_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'uploads');

-- Allow authenticated users to delete their own uploads
create policy "uploads_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'uploads');
