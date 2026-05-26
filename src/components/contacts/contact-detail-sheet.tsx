"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { confidenceLabel, formatDate } from "@/lib/utils";
import { Mail, Phone, MapPin, Briefcase, Calendar, FileText, ShieldOff, Trash2, AlertTriangle } from "lucide-react";
import type { Contact } from "@/types";

interface Props {
  contact: Contact;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground min-w-[100px] shrink-0">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

export function ContactDetailSheet({ contact: c, open, onClose, onUpdate }: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const conf = confidenceLabel(c.confidence_score);

  async function handleOptOut() {
    setLoading(true);
    const { error } = await supabase
      .from("contacts")
      .update({ opted_out: true, opted_out_at: new Date().toISOString() })
      .eq("id", c.id);
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Opted out", description: "Contact will be excluded from exports." });
      onUpdate();
      onClose();
    }
  }

  async function handleDelete() {
    setLoading(true);
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Contact record removed." });
      onUpdate();
      onClose();
    }
  }

  const displayName =
    c.full_name ??
    [c.first_name, c.last_name].filter(Boolean).join(" ") ??
    "Unknown Contact";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{displayName}</span>
            {c.is_flagged && (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium ${conf.color}`}>
              {conf.label} confidence
            </span>
            {c.opted_out && (
              <Badge variant="destructive" className="text-[10px]">Opted out</Badge>
            )}
            {c.flags && c.flags.length > 0 && c.flags.map((f) => (
              <Badge key={f} variant="warning" className="text-[10px]">{f}</Badge>
            ))}
          </div>
        </DialogHeader>

        <Separator />

        {/* Core */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</p>
          {c.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
            </div>
          )}
          {c.email_alt && <Row label="Alt email" value={c.email_alt} />}
          {c.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-mono">{c.phone}</span>
            </div>
          )}
          <Row label="Gender" value={c.gender !== "Unknown" ? c.gender : null} />
          <Row label="Age" value={c.age ?? (c.estimated_age ? `~${c.estimated_age} (estimated)` : null)} />
        </div>

        <Separator />

        {/* Location */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</p>
          {(c.city || c.country) && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{[c.city, c.country].filter(Boolean).join(", ")}</span>
            </div>
          )}
          <Row label="Address" value={c.address} />
        </div>

        <Separator />

        {/* Professional */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Professional</p>
          {(c.company || c.role) && (
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{[c.role, c.company].filter(Boolean).join(" at ")}</span>
            </div>
          )}
          <Row label="Occupation" value={c.occupation} />
        </div>

        {/* Tags */}
        {c.tags && c.tags.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          </>
        )}

        <Separator />

        {/* Provenance */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provenance</p>
          {c.created_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Added {formatDate(c.created_at)}</span>
            </div>
          )}
          {c.all_source_ids && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span>Found in {c.all_source_ids.length} document(s)</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          {!c.opted_out && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOptOut}
              disabled={loading}
              className="gap-1.5 text-muted-foreground"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Opt out
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5" disabled={loading}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete contact?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove {displayName}&apos;s record. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
