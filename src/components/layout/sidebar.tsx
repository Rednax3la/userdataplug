"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  Upload,
  Copy,
  Download,
  Database,
  LogOut,
  Settings,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/uploads", label: "Uploads", icon: Upload },
  { href: "/duplicates", label: "Duplicates", icon: Copy },
  { href: "/export", label: "Export", icon: Download },
];

function NavContent({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 select-none">
          Platform
        </p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-0.5">
        <Link
          href="/settings"
          onClick={onNav}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-sidebar border-r border-sidebar-border">
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
            <Database className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-sidebar-accent-foreground tracking-tight">
            Userplug
          </span>
        </div>
        <NavContent />
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
            <Database className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-semibold text-sidebar-accent-foreground text-sm tracking-tight">
            Userplug
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* ── Mobile drawer overlay ────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Drawer */}
          <aside
            className="relative z-10 flex w-64 flex-col bg-sidebar border-r border-sidebar-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between px-4 border-b border-sidebar-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
                  <Database className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-semibold text-sidebar-accent-foreground text-sm tracking-tight">
                  Userplug
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavContent onNav={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
