import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fileTypeIcon, formatBytes, timeAgo, statusVariant } from "@/lib/utils";
import type { Upload } from "@/types";

export async function RecentUploads() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(8);

  const uploads = (data ?? []) as Upload[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Uploads</CardTitle>
          <Link
            href="/uploads"
            className="text-xs text-primary hover:underline underline-offset-4"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {uploads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No uploads yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xl shrink-0">{fileTypeIcon(upload.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-foreground">
                    {upload.original_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {upload.file_size ? formatBytes(upload.file_size) : "—"} ·{" "}
                    {timeAgo(upload.created_at)}
                  </p>
                </div>
                <Badge variant={statusVariant(upload.status)} className="shrink-0 text-[10px]">
                  {upload.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
