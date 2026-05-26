"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fileTypeIcon, formatBytes, formatDate, statusVariant } from "@/lib/utils";
import type { Upload } from "@/types";

export function UploadsList() {
  const supabase = createClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUploads() {
      const { data } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setUploads((data ?? []) as Upload[]);
      setLoading(false);
    }
    fetchUploads();

    // Live updates
    const channel = supabase
      .channel("uploads_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "uploads" }, fetchUploads)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">All Uploads</h2>
        <span className="text-xs text-muted-foreground">{uploads.length} total</span>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>File</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : uploads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                  No uploads yet
                </TableCell>
              </TableRow>
            ) : (
              uploads.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{fileTypeIcon(u.file_type)}</span>
                      <span className="text-sm font-medium max-w-xs truncate">{u.original_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono uppercase text-muted-foreground">{u.file_type}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.file_size ? formatBytes(u.file_size) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(u.status)}>{u.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(u.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
