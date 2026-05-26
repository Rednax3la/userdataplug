"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Table2, Share2, Loader2, ShieldCheck } from "lucide-react";

type ExportFormat = "csv" | "xlsx" | "meta";

interface FormatOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ElementType;
  badge?: string;
  fields: string[];
}

const FORMATS: FormatOption[] = [
  {
    id: "csv",
    label: "Standard CSV",
    description: "All fields, UTF-8 encoded. Compatible with any CRM or spreadsheet.",
    icon: FileText,
    fields: ["full_name", "first_name", "last_name", "email", "phone", "gender", "country", "city", "company", "role", "confidence_score", "tags"],
  },
  {
    id: "xlsx",
    label: "Excel Workbook",
    description: "Multi-sheet workbook with contacts, sources, and opt-outs on separate tabs.",
    icon: Table2,
    fields: ["All fields + source tracking"],
  },
  {
    id: "meta",
    label: "Meta / Facebook Audiences",
    description: "Pre-formatted for Custom Audience and Lookalike Audience uploads.",
    icon: Share2,
    badge: "Ads-Ready",
    fields: ["fn", "ln", "email", "phone", "country", "gender"],
  },
];

export function ExportPanel() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<ExportFormat>("csv");
  const [excludeOptedOut, setExcludeOptedOut] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0);
  const [loading, setLoading] = useState(false);

  const selectedFormat = FORMATS.find((f) => f.id === selected)!;

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        format: selected,
        exclude_opted_out: excludeOptedOut.toString(),
        min_confidence: minConfidence.toString(),
      });

      const res = await fetch(`/api/export?${params.toString()}`);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Export failed");
      }

      const blob = await res.blob();
      const ext = selected === "xlsx" ? "xlsx" : "csv";
      const filename = `userplug-export-${new Date().toISOString().slice(0, 10)}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Export ready", description: `${filename} downloaded.` });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
      {/* Format selector */}
      <div className="lg:col-span-2 space-y-3">
        <h2 className="text-sm font-semibold">Select format</h2>
        {FORMATS.map((fmt) => (
          <Card
            key={fmt.id}
            onClick={() => setSelected(fmt.id)}
            className={`cursor-pointer transition-all ${
              selected === fmt.id
                ? "border-primary ring-2 ring-primary/20"
                : "hover:border-primary/40"
            }`}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  selected === fmt.id ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <fmt.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{fmt.label}</span>
                  {fmt.badge && (
                    <Badge variant="success" className="text-[10px]">{fmt.badge}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{fmt.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {fmt.fields.map((f) => (
                    <span key={f} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Options + action */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Export options</CardTitle>
            <CardDescription className="text-xs">Filters applied before export</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Opt-out filter */}
            <label className="flex items-center justify-between cursor-pointer gap-3">
              <div>
                <p className="text-sm font-medium">Exclude opted-out</p>
                <p className="text-xs text-muted-foreground">Recommended for compliance</p>
              </div>
              <button
                onClick={() => setExcludeOptedOut((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  excludeOptedOut ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    excludeOptedOut ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            <Separator />

            {/* Confidence filter */}
            <div>
              <p className="text-sm font-medium mb-1.5">
                Min. confidence: <span className="text-primary font-semibold">{Math.round(minConfidence * 100)}%</span>
              </p>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={minConfidence}
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>All records</span>
                <span>High only</span>
              </div>
            </div>

            <Separator />

            {/* Compliance notice */}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Exported data must be handled in compliance with applicable privacy laws (GDPR, Kenya DPA, etc.).
              </p>
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleExport}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {loading ? "Generating…" : `Export as ${selectedFormat.label}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
