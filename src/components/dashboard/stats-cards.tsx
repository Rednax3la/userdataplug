import { Users, TrendingUp, Loader2, GitMerge, FileText, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import type { DashboardStats } from "@/types";

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, iconColor, iconBg, subtitle }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {title}
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatNumber(value)}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <div className="col-span-2 lg:col-span-1 xl:col-span-1">
        <StatCard
          title="Total Contacts"
          value={stats.total_contacts}
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          subtitle="Unique records"
        />
      </div>
      <StatCard
        title="New This Week"
        value={stats.new_this_week}
        icon={TrendingUp}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        subtitle="Last 7 days"
      />
      <StatCard
        title="Processing"
        value={stats.processing}
        icon={Loader2}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        subtitle="In pipeline"
      />
      <StatCard
        title="Duplicates"
        value={stats.duplicates_pending}
        icon={GitMerge}
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        subtitle="Awaiting review"
      />
      <StatCard
        title="Sources Done"
        value={stats.total_sources}
        icon={FileText}
        iconBg="bg-slate-100"
        iconColor="text-slate-600"
        subtitle="Files processed"
      />
      <StatCard
        title="Opted Out"
        value={stats.opted_out}
        icon={UserX}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        subtitle="Excluded from export"
      />
    </div>
  );
}
