// ============================================================
// Userplug — Core TypeScript Types
// ============================================================

export type FileType = "pdf" | "xls" | "xlsx" | "csv" | "docx";

export type UploadStatus = "uploaded" | "queued" | "processing" | "done" | "failed";

export type DocumentStatus =
  | "pending"
  | "parsing"
  | "extracting"
  | "normalizing"
  | "deduplicating"
  | "done"
  | "failed";

export type DuplicateStatus = "pending" | "merged" | "kept_separate" | "dismissed";

export type ProcessingStage = "parse" | "extract" | "normalize" | "deduplicate";

// ============================================================
// Database Row Types (mirrors Supabase schema)
// ============================================================

export interface Upload {
  id: string;
  user_id: string;
  original_name: string;
  storage_path: string;
  file_type: FileType;
  file_size: number | null;
  status: UploadStatus;
  created_at: string;
}

export interface SourceDocument {
  id: string;
  upload_id: string;
  file_name: string;
  file_path: string;
  file_type: FileType;
  file_size: number | null;
  page_count: number | null;
  status: DocumentStatus;
  entities_found: number;
  error_message: string | null;
  processing_meta: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface Contact {
  id: string;
  email: string | null;
  email_alt: string | null;
  phone: string | null;
  phone_raw: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  gender: "M" | "F" | "Unknown" | null;
  country: string | null;
  country_raw: string | null;
  city: string | null;
  address: string | null;
  company: string | null;
  role: string | null;
  occupation: string | null;
  age: number | null;
  estimated_age: number | null;
  social_links: Record<string, string> | null;
  interests: string[] | null;
  tags: string[] | null;
  purchase_signals: Record<string, unknown> | null;
  invoice_history: Record<string, unknown> | null;
  primary_source_id: string | null;
  all_source_ids: string[] | null;
  field_sources: Record<string, string> | null;
  confidence_score: number | null;
  flags: string[] | null;
  is_flagged: boolean;
  opted_out: boolean;
  opted_out_at: string | null;
  consent_source: string | null;
  canonical_id: string | null;
  is_duplicate: boolean;
  merged_from: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateCandidate {
  id: string;
  contact_a: string;
  contact_b: string;
  match_score: number;
  match_reasons: string[];
  status: DuplicateStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // Joined
  contact_a_data?: Contact;
  contact_b_data?: Contact;
}

export interface ProcessingLog {
  id: string;
  source_document_id: string;
  stage: ProcessingStage;
  status: "started" | "success" | "error";
  message: string | null;
  metadata: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
}

// ============================================================
// Extraction Pipeline Types
// ============================================================

export interface ExtractedEntity {
  // Identity
  email?: string;
  email_alt?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  gender?: "M" | "F" | "Unknown";

  // Location
  country?: string;
  city?: string;
  address?: string;

  // Professional
  company?: string;
  role?: string;
  occupation?: string;

  // Demographics
  age?: number;
  estimated_age?: number;

  // Enrichment
  social_links?: Record<string, string>;
  interests?: string[];
  tags?: string[];

  // Quality
  confidence_score: number;
  flags: string[];
  source_row?: number;
  source_page?: number;
  extraction_method: "deterministic" | "ai" | "mixed";
}

export interface ExtractionResult {
  document_id: string;
  entities: ExtractedEntity[];
  processing_time_ms: number;
  pages_processed?: number;
  rows_processed?: number;
  method: "deterministic" | "ai" | "mixed";
}

// ============================================================
// API Request / Response Types
// ============================================================

export interface UploadResponse {
  upload_id: string;
  document_id: string;
  status: "queued";
}

export interface ContactsQueryParams {
  page?: number;
  per_page?: number;
  search?: string;
  country?: string;
  gender?: string;
  source_id?: string;
  flagged?: boolean;
  opted_out?: boolean;
  min_confidence?: number;
  sort_by?: keyof Contact;
  sort_dir?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface DashboardStats {
  total_contacts: number;
  new_this_week: number;
  processing: number;
  duplicates_pending: number;
  total_sources: number;
  opted_out: number;
}

export interface ExportOptions {
  format: "csv" | "xlsx" | "meta";
  fields: (keyof Contact)[];
  filters?: {
    country?: string;
    min_confidence?: number;
    exclude_opted_out?: boolean;
    tags?: string[];
  };
}
