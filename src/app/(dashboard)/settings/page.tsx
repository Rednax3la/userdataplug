import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Settings, Shield, User } from "lucide-react";
import { AdminPanel } from "@/components/settings/admin-panel";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check if this user is an admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, approved")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-400" />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account and platform settings</p>
      </div>

      {/* Account info */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-slate-400" /> Account
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Email</span>
            <span className="text-slate-200">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Role</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isAdmin ? "bg-blue-500/15 text-blue-400" : "bg-slate-700 text-slate-300"
            }`}>
              {profile?.role ?? "user"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Status</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              profile?.approved ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
            }`}>
              {profile?.approved ? "Approved" : "Pending approval"}
            </span>
          </div>
        </div>
      </section>

      {/* Admin section */}
      {isAdmin && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-blue-400" /> User Management
          </h2>
          <AdminPanel />
        </section>
      )}

      {!isAdmin && (
        <p className="text-slate-600 text-xs text-center mt-8">
          Contact your administrator to change account settings.
        </p>
      )}
    </div>
  );
}
