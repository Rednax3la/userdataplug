# Userplug

AI-powered user data extraction, enrichment, and audience preparation platform.

## Overview

Userplug recursively scans uploaded files (PDF, XLS/XLSX, CSV, DOCX), extracts person/contact information using a combination of deterministic parsing and Claude AI, deduplicates records, and presents everything in a clean dashboard. Exports are compatible with Meta/Facebook Ads Custom Audiences and standard CRM imports.

## Architecture

```
Next.js (Vercel)          Python Extractor (Railway)
┌─────────────────┐       ┌──────────────────────┐
│  App Router     │──────▶│  FastAPI             │
│  Supabase Auth  │       │  PDF / XLS / CSV     │
│  API Routes     │◀──────│  Claude Haiku AI     │
│  Dashboard UI   │       │  Entity normalization│
└────────┬────────┘       └──────────────────────┘
         │
   ┌─────▼──────┐
   │  Supabase  │
   │  Postgres  │
   │  Storage   │
   └────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- A Supabase project
- An Anthropic (Claude) API key

### 1. Clone and install

```bash
git clone https://github.com/Rednax3la/userdataplug.git
cd userdataplug
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
# Fill in your Supabase URL, keys, and Anthropic API key
```

### 3. Supabase setup

1. Go to your Supabase dashboard → SQL Editor
2. Run the contents of `supabase/migrations/001_initial_schema.sql`
3. Go to Storage → Create bucket named `uploads` (private)

### 4. Run the dashboard

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Run the Python extractor

```bash
cd extractor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Fill in your .env values
uvicorn main:app --reload --port 8000
```

## Project Structure

```
userdataplug/
├── src/
│   ├── app/
│   │   ├── (auth)/login/        # Login page
│   │   ├── (dashboard)/         # All dashboard pages
│   │   └── api/                 # API routes
│   ├── components/
│   │   ├── ui/                  # shadcn/ui base components
│   │   ├── layout/              # Sidebar, header
│   │   ├── dashboard/           # Stats, queue, recent uploads
│   │   ├── contacts/            # Table + detail sheet
│   │   ├── duplicates/          # Review UI
│   │   ├── upload/              # Drop zone + list
│   │   └── export/              # Export panel
│   ├── lib/
│   │   ├── supabase/            # Client + server Supabase clients
│   │   └── extraction/          # Normalizers + deduplicator (TS)
│   └── types/                   # TypeScript types
├── extractor/                   # Python microservice
│   ├── main.py                  # FastAPI app
│   ├── parsers/                 # PDF, Excel, CSV, DOCX parsers
│   └── extractors/              # Deterministic + AI extractors
└── supabase/
    └── migrations/              # SQL schema
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for full deployment instructions.

## Compliance

- Records can be opted out via the contact detail view
- Opted-out records are excluded from exports by default
- All extraction avoids hallucination — only data explicitly present in documents is extracted
- Confidence scores are preserved for every extracted field
- Source document provenance is tracked per record

## License

Private. All rights reserved.
