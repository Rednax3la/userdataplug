"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Database, Loader2, Mail } from "lucide-react";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setRegistered(true);
      setLoading(false);
    }
  }

  // Post-signup confirmation screen
  if (registered) {
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
            <div className="w-12 h-12 bg-blue-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-white font-semibold text-lg mb-2">Check your email</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-slate-200 font-medium">{email}</span>. Click
              it to activate your account, then sign in.
            </p>
            <button
              onClick={() => { setRegistered(false); setMode("signin"); }}
              className="mt-6 text-blue-400 hover:text-blue-300 text-sm transition"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-xl tracking-tight">Userplug</span>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          {/* Tabs */}
          <div className="flex bg-slate-800 rounded-lg p-1 mb-7">
            <button
              onClick={() => switchMode("signin")}
              className={`flex-1 text-sm font-medium rounded-md py-1.5 transition ${
                mode === "signin"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => switchMode("signup")}
              className={`flex-1 text-sm font-medium rounded-md py-1.5 transition ${
                mode === "signup"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-slate-300 text-sm font-medium block">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-slate-300 text-sm font-medium block">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <label htmlFor="confirm" className="text-slate-300 text-sm font-medium block">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading
                ? mode === "signin" ? "Signing in…" : "Creating account…"
                : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Userplug — Confidential. Authorized use only.
        </p>
      </div>
    </div>
  );
}
