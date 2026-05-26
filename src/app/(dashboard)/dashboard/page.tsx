import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentUploads } from "@/components/dashboard/recent-uploads";
import { ProcessingQueue } from "@/components/dashboard/processing-queue";
import { createClient } from "@/lib/supabase/server";
import type { DashboardStats } from "@/types";

async function getStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [total, newThisWeek, processing, dupes, sources, optedOut] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("is_duplicate", false),
    supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("source_documents").select("id", { count: "exact", head: true })
      .in("status", ["pending", "parsing", "extracting", "normalizing", "deduplicating"]),
    supabase.from("duplicate_candidates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("source_documents").select("id", { count: "exact", head: true }).eq("status", "done"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("opted_out", true),
  ]);

  return {
    total_contacts: total.count ?? 0,
    new_this_week: newThisWeek.count ?? 0,
    processing: processing.count ?? 0,
    duplicates_pending: dupes.count ?? 0,
    total_sources: sources.count ?? 0,
    opted_out: optedOut.count ?? 0,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Dashboard"
        description="Overview of your data extraction pipeline"
      />
      <div className="flex-1 p-6 space-y-6 animate-fade-in">
        <StatsCards stats={stats} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProcessingQueue />
          <RecentUploads />
        </div>
      </div>
    </div>
  );
}
