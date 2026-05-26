import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function confidenceLabel(score: number | null): {
  label: string;
  color: string;
} {
  if (score === null) return { label: "Unknown", color: "text-slate-400" };
  if (score >= 0.85) return { label: "High", color: "text-emerald-600" };
  if (score >= 0.6) return { label: "Medium", color: "text-amber-600" };
  return { label: "Low", color: "text-red-500" };
}

export function fileTypeIcon(type: string): string {
  const map: Record<string, string> = {
    pdf: "📄",
    xls: "📊",
    xlsx: "📊",
    csv: "📋",
    docx: "📝",
  };
  return map[type.toLowerCase()] ?? "📁";
}

export function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// Status badge variants
export function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    done: "default",
    completed: "default",
    processing: "secondary",
    extracting: "secondary",
    parsing: "secondary",
    pending: "outline",
    queued: "outline",
    uploaded: "outline",
    failed: "destructive",
    error: "destructive",
  };
  return map[status] ?? "outline";
}
