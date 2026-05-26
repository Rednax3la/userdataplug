# Setup Guide

## 1. Supabase

### Create project
1. Go to https://supabase.com/dashboard/new
2. Name: `userplug`, pick a region
3. Save your database password

### Run schema
1. Go to SQL Editor in your Supabase dashboard
2. Paste and run: `supabase/migrations/001_initial_schema.sql`

### Create storage bucket
1. Go to Storage → New bucket
2. Name: `uploads`
3. Public: **No** (private)
4. Allowed MIME types: `application/pdf, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv, application/vnd.openxmlformats-officedocument.wordprocessingml.document`
5. Max file size: 50MB

### Get API keys
Settings → API:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

### Create first user
Authentication → Users → Invite user (or use the sign-up flow)

## 2. Anthropic API Key

1. Go to https://console.anthropic.com/
2. API Keys → Create key
3. Copy to `ANTHROPIC_API_KEY` in both `.env.local` and `extractor/.env`

## 3. Generate a service secret

This secret is shared between Next.js and the Python extractor for callback authentication.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output to:
- `EXTRACTOR_SERVICE_SECRET` in `.env.local`
- `SERVICE_SECRET` in `extractor/.env`

## 4. Environment variables summary

### `.env.local` (Next.js)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
EXTRACTOR_SERVICE_URL=http://localhost:8000
EXTRACTOR_SERVICE_SECRET=<generated secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### `extractor/.env`
```
SERVICE_SECRET=<same secret>
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 5. OCR support (optional)

For scanned PDFs, Tesseract OCR must be installed on the extractor server:

```bash
# Ubuntu/Debian
sudo apt-get install tesseract-ocr

# macOS
brew install tesseract

# Windows
# Download installer from https://github.com/UB-Mannheim/tesseract/wiki
```
