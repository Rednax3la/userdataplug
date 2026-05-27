import Link from "next/link";
import {
  Database,
  FileSearch,
  Users,
  Download,
  ShieldCheck,
  Zap,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: FileSearch,
    title: "Bulk file extraction",
    body: "Upload PDFs, spreadsheets, Word docs, and CSVs in one go. The AI pipeline pulls every name, email, phone, and location it finds.",
  },
  {
    icon: Users,
    title: "Smart deduplication",
    body: "Exact and fuzzy matching across email, phone, and name. High-confidence duplicates are merged automatically; borderline cases are queued for review.",
  },
  {
    icon: Zap,
    title: "AI enrichment",
    body: "Unstructured documents — scanned lists, freeform text, messy tables — are parsed by Claude to extract structured contact data.",
  },
  {
    icon: Download,
    title: "Export-ready",
    body: "Download clean CSV or Excel exports, or generate a Meta Custom Audience file (fn, ln, email, phone, country, gender) in one click.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance built in",
    body: "Opt-out tracking, confidence scores, and field-level provenance on every record. Know exactly where every data point came from.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="border-b border-slate-800/60 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-tight">Userplug</span>
          </div>
          <Link
            href="/login"
            className="text-sm text-slate-300 hover:text-white transition flex items-center gap-1.5"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1.5 text-blue-400 text-xs font-medium mb-8">
          <Zap className="w-3 h-3" />
          AI-powered · Zero infrastructure · Free to deploy
        </div>

        <h1 className="text-5xl font-bold tracking-tight leading-tight mb-6">
          Turn scattered files into
          <br />
          <span className="text-blue-400">a clean contact database</span>
        </h1>

        <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed mb-10">
          Upload any mix of PDFs, spreadsheets, and documents. Userplug
          extracts, deduplicates, and enriches every contact — then exports
          audiences ready for Meta, email tools, or CRMs.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-6 py-3 text-sm transition flex items-center gap-2"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="text-slate-400 hover:text-slate-300 text-sm transition"
          >
            Sign in to existing account
          </Link>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="border-t border-slate-800" />
      </div>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-widest text-center mb-12">
          What it does
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition"
            >
              <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
                <Icon className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="text-white font-medium text-sm mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-500/20 rounded-2xl px-8 py-10 text-center">
          <h2 className="text-white font-semibold text-2xl mb-3">
            Ready to plug in your data?
          </h2>
          <p className="text-slate-400 text-sm mb-7 max-w-sm mx-auto">
            Create an account in seconds. No credit card, no infrastructure to
            set up.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-6 py-3 text-sm transition"
          >
            Create free account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-slate-600 text-xs">
          <span>Userplug — Confidential. Authorized use only.</span>
          <Link href="/login" className="hover:text-slate-400 transition">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
