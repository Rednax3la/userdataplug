"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, X, Loader2, ShieldCheck, ShieldOff } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  role: string;
  approved: boolean;
  created_at: string;
}

export function AdminPanel() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_profiles")
      .select("id, email, role, approved, created_at")
      .order("created_at", { ascending: false });
    setUsers((data ?? []) as UserProfile[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function setApproved(userId: string, approved: boolean) {
    setActionId(userId);
    await supabase
      .from("user_profiles")
      .update({ approved })
      .eq("id", userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, approved } : u))
    );
    setActionId(null);
  }

  async function setRole(userId: string, role: string) {
    setActionId(userId);
    await supabase
      .from("user_profiles")
      .update({ role })
      .eq("id", userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    );
    setActionId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
      </div>
    );
  }

  if (users.length === 0) {
    return <p className="text-slate-500 text-sm py-2">No users found.</p>;
  }

  const pending = users.filter((u) => !u.approved);
  const approved = users.filter((u) => u.approved);

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <p className="text-xs text-yellow-400 font-medium uppercase tracking-wide mb-3">
            Pending approval ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                busy={actionId === u.id}
                onApprove={() => setApproved(u.id, true)}
                onRevoke={() => setApproved(u.id, false)}
                onRoleToggle={() => setRole(u.id, u.role === "admin" ? "user" : "admin")}
              />
            ))}
          </div>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-3">
            Approved users ({approved.length})
          </p>
          <div className="space-y-2">
            {approved.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                busy={actionId === u.id}
                onApprove={() => setApproved(u.id, true)}
                onRevoke={() => setApproved(u.id, false)}
                onRoleToggle={() => setRole(u.id, u.role === "admin" ? "user" : "admin")}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  busy,
  onApprove,
  onRevoke,
  onRoleToggle,
}: {
  user: UserProfile;
  busy: boolean;
  onApprove: () => void;
  onRevoke: () => void;
  onRoleToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-slate-200 truncate">{user.email}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            user.role === "admin" ? "bg-blue-500/15 text-blue-400" : "bg-slate-700 text-slate-400"
          }`}>
            {user.role}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            user.approved ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
          }`}>
            {user.approved ? "approved" : "pending"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : (
          <>
            {user.approved ? (
              <button
                onClick={onRevoke}
                title="Revoke access"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onApprove}
                title="Approve"
                className="p-1.5 rounded-lg text-slate-400 hover:text-green-400 hover:bg-green-400/10 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onRoleToggle}
              title={user.role === "admin" ? "Remove admin" : "Make admin"}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
            >
              {user.role === "admin" ? (
                <ShieldOff className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
