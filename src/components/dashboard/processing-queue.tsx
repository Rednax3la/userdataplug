import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fileTypeIcon, statusVariant, timeAgo } from "@/lib/utils";
import type { SourceDocument } from "@/types";

const STATUS_PROGRESS: Record<string, number> = {
  pending: 5,
  parsing: 20,
  extracting: 50,
  normalizing: 75,
  deduplicating: 90,
  done: 100,
  failed: 100,
};

export async function ProcessingQueue() {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("source_documents")
    .select("*")
    .in("status", ["pending", "parsing", "extracting", "normalizing", "deduplicating", "failed"])
    .order("created_at", { ascending: false })
    .limit(8);

  const queue = (docs ?? []) as SourceDocument[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Processing Queue</CardTitle>
          <span className="text-xs text-muted-foreground">
            {queue.length} active
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">Queue is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Upload files to start processing</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((doc) => (
              <div key={doc.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base leading-none">{fileTypeIcon(doc.file_type)}</span>
                    <span className="text-xs font-medium truncate text-foreground">
                      {doc.file_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={doc.status === "failed" ? "destructive" : "secondary"}>
                      {doc.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(doc.created_at)}
                    </span>
                  </div>
                </div>
                <Progress
                  value={STATUS_PROGRESS[doc.status] ?? 0}
                  className={`h-1 ${doc.status === "failed" ? "[&>div]:bg-destructive" : ""}`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
