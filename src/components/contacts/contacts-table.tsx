"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactDetailSheet } from "./contact-detail-sheet";
import { confidenceLabel, formatDateShort, truncate } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { Contact } from "@/types";

const PER_PAGE = 25;

export function ContactsTable() {
  const supabase = createClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [selected, setSelected] = useState<Contact | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("is_duplicate", false)
      .order("created_at", { ascending: false })
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%`
      );
    }
    if (country && country !== "all") {
      query = query.eq("country", country);
    }

    const { data, count } = await query;
    setContacts((data ?? []) as Contact[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search, country]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={country} onValueChange={(v) => { setCountry(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            <SelectItem value="KE">Kenya (KE)</SelectItem>
            <SelectItem value="UG">Uganda (UG)</SelectItem>
            <SelectItem value="TZ">Tanzania (TZ)</SelectItem>
            <SelectItem value="NG">Nigeria (NG)</SelectItem>
            <SelectItem value="GH">Ghana (GH)</SelectItem>
            <SelectItem value="ZA">South Africa (ZA)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {total.toLocaleString()} records
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-48">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              ))
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  No contacts found
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => {
                const conf = confidenceLabel(c.confidence_score);
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(c)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {c.is_flagged && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium text-sm">
                          {c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ") ?? (
                            <span className="text-muted-foreground italic">Unknown</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email ? truncate(c.email, 28) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">
                      {c.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      {c.gender && c.gender !== "Unknown" ? (
                        <Badge variant="outline" className="text-xs">{c.gender}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.country ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.company ? truncate(c.company, 20) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${conf.color}`}>
                        {conf.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateShort(c.created_at)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selected && (
        <ContactDetailSheet
          contact={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onUpdate={fetchContacts}
        />
      )}
    </div>
  );
}
