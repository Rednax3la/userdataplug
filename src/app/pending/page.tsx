"use client";

import { useState } from "react";
import { Database, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function claimAdmin() {
    setClaiming(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/bootstrap");
      const data = await res.json();
      if (res.ok) {
        setMsg("✓ You are now admin. Redirecting…");
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        setMsg(data.error ?? "Failed");
      }
    } catch {
      setMsg("Network error");
    }
    setClaiming(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">Userplug</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-yellow-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6 text-yellow-400" />
          </div>
          <h1 className="text-white font-semibold text-lg mb-2">Awaiting approval</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your account has been created. An administrator needs to approve
            your access before you can use the platform.
          </p>

          {msg && (
            <p className={`mt-4 text-sm rounded-lg px-3 py-2 ${
              msg.startsWith("✓")
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>{msg}</p>
          )}

          {/* First-run bootstrap — only works if no admin exists yet */}
          <button
            onClick={claimAdmin}
            disabled={claiming}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition"
          >
            {claiming && <Loader2 className="w-4 h-4 animate-spin" />}
            Claim admin access
          </button>
          <p className="text-slate-600 text-xs mt-2">
            Only works when no admin exists yet
          </p>

          <button
            onClick={signOut}
            className="mt-5 text-slate-500 hover:text-slate-400 text-sm transition block w-full"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
