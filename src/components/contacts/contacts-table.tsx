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
import { Search, ChevronLeft, ChevronRight, AlertTriangle, Plus, X, Loader2 } from "lucide-react";
import type { Contact } from "@/types";

const PER_PAGE = 25;

type HasFilter = "any" | "email" | "phone" | "both" | "email_only" | "phone_only";

interface ManualEntry {
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  country: string;
  city: string;
  company: string;
  role: string;
}

const EMPTY: ManualEntry = {
  full_name: "", email: "", phone: "", gender: "",
  country: "", city: "", company: "", role: "",
};

export function ContactsTable() {
  const supabase = createClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [country, setCountry] = useState("all");
  const [gender, setGender] = useState("all");
  const [hasFilter, setHasFilter] = useState<HasFilter>("any");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ManualEntry>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (country !== "all") query = query.eq("country", country);
    if (gender !== "all") query = query.eq("gender", gender);

    // Has-data filters
    if (hasFilter === "email") query = query.not("email", "is", null);
    else if (hasFilter === "phone") query = query.not("phone", "is", null);
    else if (hasFilter === "both") {
      query = query.not("email", "is", null).not("phone", "is", null);
    } else if (hasFilter === "email_only") {
      query = query.not("email", "is", null).is("phone", null);
    } else if (hasFilter === "phone_only") {
      query = query.is("email", null).not("phone", "is", null);
    }

    const { data, count } = await query;
    setContacts((data ?? []) as Contact[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search, country, gender, hasFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const activeFilters = [
    country !== "all" && `Country: ${country}`,
    gender !== "all" && `Gender: ${gender}`,
    hasFilter !== "any" && `Has: ${hasFilter.replace("_", " ")}`,
  ].filter(Boolean) as string[];

  function resetFilters() {
    setCountry("all"); setGender("all"); setHasFilter("any"); setPage(0);
  }

  // Manual entry
  function fieldChange(k: keyof ManualEntry, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    // Minimal validation
    if (!form.full_name.trim() && !form.email.trim() && !form.phone.trim()) {
      setSaveError("Enter at least a name, email, or phone.");
      setSaving(false);
      return;
    }

    const payload = {
      full_name: form.full_name.trim() || null,
      email: form.email.trim().toLowerCase() || null,
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      country: form.country.trim().toUpperCase() || null,
      city: form.city.trim() || null,
      company: form.company.trim() || null,
      role: form.role.trim() || null,
      confidence_score: 0.95, // manually entered = high confidence
      is_duplicate: false,
      is_flagged: false,
      opted_out: false,
      flags: ["manual_entry"],
    };

    const { error } = await supabase.from("contacts").insert(payload);
    if (error) {
      setSaveError(error.message);
    } else {
      setShowModal(false);
      setForm(EMPTY);
      fetchContacts();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Has-data filter */}
        <Select value={hasFilter} onValueChange={(v) => { setHasFilter(v as HasFilter); setPage(0); }}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="Has data…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any data</SelectItem>
            <SelectItem value="email">Has email</SelectItem>
            <SelectItem value="phone">Has phone</SelectItem>
            <SelectItem value="both">Has email + phone</SelectItem>
            <SelectItem value="email_only">Email only (no phone)</SelectItem>
            <SelectItem value="phone_only">Phone only (no email)</SelectItem>
          </SelectContent>
        </Select>

        {/* Country filter */}
        <Select value={country} onValueChange={(v) => { setCountry(v); setPage(0); }}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            <SelectItem value="KE">Kenya</SelectItem>
            <SelectItem value="UG">Uganda</SelectItem>
            <SelectItem value="TZ">Tanzania</SelectItem>
            <SelectItem value="NG">Nigeria</SelectItem>
            <SelectItem value="GH">Ghana</SelectItem>
            <SelectItem value="ZA">South Africa</SelectItem>
            <SelectItem value="ET">Ethiopia</SelectItem>
            <SelectItem value="RW">Rwanda</SelectItem>
            <SelectItem value="ZM">Zambia</SelectItem>
            <SelectItem value="ZW">Zimbabwe</SelectItem>
          </SelectContent>
        </Select>

        {/* Gender filter */}
        <Select value={gender} onValueChange={(v) => { setGender(v); setPage(0); }}>
          <SelectTrigger className="w-28 h-9 text-sm">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="M">Male</SelectItem>
            <SelectItem value="F">Female</SelectItem>
          </SelectContent>
        </Select>

        {activeFilters.length > 0 && (
          <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition">
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {total.toLocaleString()} records
        </span>

        <Button size="sm" onClick={() => { setShowModal(true); setSaveError(null); setForm(EMPTY); }}
          className="h-9 gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Add contact
        </Button>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {activeFilters.map((f) => (
            <span key={f} className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-1">
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Conf.</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  No contacts found
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => {
                const conf = confidenceLabel(c.confidence_score);
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {c.is_flagged && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        <span className="font-medium text-sm">
                          {c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ") || (
                            <span className="text-muted-foreground italic">Unknown</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.email ? truncate(c.email, 28) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs">{c.phone ?? "—"}</TableCell>
                    <TableCell>
                      {c.gender && c.gender !== "Unknown"
                        ? <Badge variant="outline" className="text-xs">{c.gender}</Badge>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{c.country ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.company ? truncate(c.company, 20) : "—"}</TableCell>
                    <TableCell><span className={`text-xs font-medium ${conf.color}`}>{conf.label}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateShort(c.created_at)}</TableCell>
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
          <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selected && (
        <ContactDetailSheet contact={selected} open={!!selected} onClose={() => setSelected(null)} onUpdate={fetchContacts} />
      )}

      {/* Manual entry modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-white font-semibold text-sm">Add contact manually</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveManual} className="p-5 space-y-3">
              {[
                { key: "full_name", label: "Full name", placeholder: "Jane Doe" },
                { key: "email", label: "Email", placeholder: "jane@example.com" },
                { key: "phone", label: "Phone", placeholder: "+254722000000" },
                { key: "company", label: "Company / Organisation", placeholder: "Acme Ltd" },
                { key: "role", label: "Role / Job title", placeholder: "Manager" },
                { key: "city", label: "City", placeholder: "Nairobi" },
                { key: "country", label: "Country (ISO code)", placeholder: "KE" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-slate-400 text-xs font-medium block mb-1">{label}</label>
                  <input
                    type="text"
                    value={form[key as keyof ManualEntry]}
                    onChange={(e) => fieldChange(key as keyof ManualEntry, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              ))}

              <div>
                <label className="text-slate-400 text-xs font-medium block mb-1">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => fieldChange("gender", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                >
                  <option value="">Unknown</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              {saveError && (
                <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-4 py-2 text-sm transition">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2 text-sm transition flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
