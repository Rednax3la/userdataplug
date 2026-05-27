"use client";

import { Database, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const supabase = createClient();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
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
          <button
            onClick={signOut}
            className="mt-6 text-slate-500 hover:text-slate-400 text-sm transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
