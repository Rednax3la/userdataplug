"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { GitMerge, SplitSquareVertical, X, CheckCircle2 } from "lucide-react";
import type { DuplicateCandidate, Contact } from "@/types";

interface DupWithContacts extends DuplicateCandidate {
  contact_a_data: Contact;
  contact_b_data: Contact;
}

function ContactMiniCard({ contact, label }: { contact: Contact; label: string }) {
  const name =
    contact.full_name ??
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ??
    "Unknown";

  return (
    <div className="flex-1 rounded-lg border bg-muted/30 p-4 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium text-sm">{name}</p>
      {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
      {contact.phone && <p className="text-xs font-mono text-muted-foreground">{contact.phone}</p>}
      {contact.country && <p className="text-xs text-muted-foreground">{contact.country}</p>}
      {contact.company && <p className="text-xs text-muted-foreground">{contact.company}</p>}
    </div>
  );
}

export function DuplicatesReview() {
  const supabase = createClient();
  const { toast } = useToast();
  const [pairs, setPairs] = useState<DupWithContacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function fetchPairs() {
    setLoading(true);
    const { data } = await supabase
      .from("duplicate_candidates")
      .select(`
        *,
        contact_a_data:contacts!contact_a(*),
        contact_b_data:contacts!contact_b(*)
      `)
      .eq("status", "pending")
      .order("match_score", { ascending: false })
      .limit(20);
    setPairs((data ?? []) as unknown as DupWithContacts[]);
    setLoading(false);
  }

  useEffect(() => { fetchPairs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolve(
    pairId: string,
    action: "merged" | "kept_separate" | "dismissed",
    contactAId?: string,
    contactBId?: string
  ) {
    setActing(pairId);

    if (action === "merged" && contactAId && contactBId) {
      // Call merge API
      const res = await fetch("/api/duplicates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair_id: pairId, action, keep_id: contactAId, merge_id: contactBId }),
      });
      if (!res.ok) {
        toast({ title: "Merge failed", variant: "destructive" });
        setActing(null);
        return;
      }
      toast({ title: "Merged", description: "Records combined." });
    } else {
      await supabase
        .from("duplicate_candidates")
        .update({ status: action })
        .eq("id", pairId);
      toast({
        title: action === "kept_separate" ? "Kept separate" : "Dismissed",
        description: "Pair resolved.",
      });
    }

    setActing(null);
    fetchPairs();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-3">
              <Skeleton className="h-24 flex-1 rounded-lg" />
              <Skeleton className="h-24 flex-1 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
        <p className="font-medium text-foreground">No duplicates to review</p>
        <p className="text-sm text-muted-foreground mt-1">
          All flagged pairs have been resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pairs.length} pair(s) pending review
      </p>

      {pairs.map((pair) => (
        <Card key={pair.id}>
          <CardContent className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Match score</span>
                <Badge
                  variant={pair.match_score >= 0.85 ? "default" : "secondary"}
                >
                  {Math.round(pair.match_score * 100)}%
                </Badge>
                {pair.match_reasons.map((r) => (
                  <Badge key={r} variant="outline" className="text-[10px]">{r.replace(/_/g, " ")}</Badge>
                ))}
              </div>
            </div>

            {/* Side-by-side */}
            <div className="flex gap-3">
              <ContactMiniCard contact={pair.contact_a_data} label="Record A" />
              <ContactMiniCard contact={pair.contact_b_data} label="Record B" />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={acting === pair.id}
                onClick={() => resolve(pair.id, "merged", pair.contact_a, pair.contact_b)}
              >
                <GitMerge className="h-3.5 w-3.5" />
                Merge (keep A)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={acting === pair.id}
                onClick={() => resolve(pair.id, "kept_separate")}
              >
                <SplitSquareVertical className="h-3.5 w-3.5" />
                Keep separate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                disabled={acting === pair.id}
                onClick={() => resolve(pair.id, "dismissed")}
              >
                <X className="h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
