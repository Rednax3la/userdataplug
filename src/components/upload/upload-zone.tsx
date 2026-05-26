"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { formatBytes, fileTypeIcon } from "@/lib/utils";
import { Upload, X, CheckCircle2, Loader2 } from "lucide-react";

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

export function UploadZone() {
  const supabase = createClient();
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: UploadFile[] = accepted.map((file) => ({
      file,
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024, // 50MB
    onDropRejected: (rejections) => {
      rejections.forEach((r) => {
        toast({
          title: `Rejected: ${r.file.name}`,
          description: r.errors[0]?.message,
          variant: "destructive",
        });
      });
    },
  });

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function processUpload() {
    if (!files.some((f) => f.status === "pending")) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.status !== "pending") continue;

      setFiles((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: "uploading", progress: 10 } : item))
      );

      try {
        // 1. Upload to Supabase storage
        const ext = f.file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from("uploads")
          .upload(storagePath, f.file, { contentType: f.file.type });

        if (storageError) throw storageError;

        setFiles((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, progress: 40 } : item))
        );

        // 2. Trigger processing via API
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_name: f.file.name,
            storage_path: storagePath,
            file_type: ext,
            file_size: f.file.size,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error ?? "Processing failed");
        }

        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "done", progress: 100 } : item
          )
        );

        toast({
          title: "Queued for processing",
          description: `${f.file.name} is in the pipeline.`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "error", progress: 0, error: message } : item
          )
        );
        toast({ title: "Upload failed", description: message, variant: "destructive" });
      }
    }

    setUploading(false);
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {isDragActive ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, XLS, XLSX, CSV, DOCX up to 50MB
            </p>
          </div>
          <p className="text-xs text-primary font-medium">or click to browse</p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b flex items-center justify-between">
            <p className="text-sm font-medium">{files.length} file(s) selected</p>
            {pendingCount > 0 && (
              <button
                onClick={processUpload}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 rounded-lg px-3 py-1.5 transition"
              >
                {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {uploading ? "Processing…" : `Upload ${pendingCount} file(s)`}
              </button>
            )}
          </div>
          <ul className="divide-y">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                <span className="text-xl shrink-0">
                  {fileTypeIcon(f.file.name.split(".").pop() ?? "")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{f.file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatBytes(f.file.size)}</p>
                  {f.status === "uploading" && (
                    <Progress value={f.progress} className="h-1 mt-1" />
                  )}
                  {f.status === "error" && (
                    <p className="text-[10px] text-destructive mt-0.5">{f.error}</p>
                  )}
                </div>
                <div className="shrink-0">
                  {f.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : f.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  ) : (
                    <button
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
