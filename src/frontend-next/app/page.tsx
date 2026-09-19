import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Chemistry, MachineLearningModel, Meter, Radar, Tools, WarningAlt } from "@carbon/icons-react";

const description =
  "Grid Risk Command Center predicts electricity-grid equipment failures, explains " +
  "the drivers with SHAP, ranks them by customer impact, simulates outages and " +
  "dispatches crews. Runs entirely on simulation data.";

export const metadata: Metadata = {
  title: {
    absolute: "Grid Risk Command Center — Predict, Explain and Prioritise Grid Failures",
  },
  description,
  alternates: { canonical: "/" },
};

type PublicStats = {
  seeded: boolean;
  is_simulation?: boolean;
  assets_monitored?: number;
  assets_at_risk?: number;
  customers_protected?: number;
  areas_monitored?: number;
  model?: string | null;
  roc_auc?: number | null;
  prediction_horizon_hours?: number;
  as_of?: string | null;
};

async function getStats(): Promise<PublicStats | null> {
  const base = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${base}/api/public/stats`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicStats;
    return data?.seeded ? data : null;
  } catch {
    return null;
  }
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US") : null;

const auc = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : null;

function asOf(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const STEPS = [
  {
    icon: Radar,
    name: "Predict",
    body: "A LightGBM classifier scores every transformer and substation for failure inside the prediction horizon.",
  },
  {
    icon: MachineLearningModel,
    name: "Explain",
    body: "SHAP attributes each score to its actual risk drivers, so an operator sees why an asset is ranked.",
  },
  {
    icon: Meter,
    name: "Prioritise",
    body: "The Grid Impact Score blends failure probability with asset criticality, customers served, and network exposure.",
  },
  {
    icon: Chemistry,
    name: "Simulate",
    body: "What-if runs: take an asset out of service, or push a severe-weather scenario, and watch how risk moves.",
  },
  {
    icon: Tools,
    name: "Act",
    body: "Dispatch a crew, raise a work order and track it to completion without leaving the console.",
  },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-5 py-4 transition-transform hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(15,81,50,0.08)]">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#95d4ac]/20 to-transparent rounded-full -mr-10 -mt-10" />
      <dt className="text-xs font-semibold uppercase tracking-widest text-[#55554f]">
        {label}
      </dt>
      <dd className="mt-2 font-mono text-3xl font-bold tracking-tight text-[#0f5132]">
        {value}
      </dd>
    </div>
  );
}

export default async function LandingPage() {
  const stats = await getStats();

  const tiles = stats
    ? [
        { label: "Assets monitored", value: num(stats.assets_monitored) },
        { label: "Customers protected", value: num(stats.customers_protected) },
        { label: "Areas monitored", value: num(stats.areas_monitored) },
        { label: "Model ROC-AUC", value: auc(stats.roc_auc) },
      ].filter((t): t is { label: string; value: string } => t.value !== null)
    : [];

  const stamp = asOf(stats?.as_of);

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col font-sans overflow-x-hidden relative selection:bg-[#95d4ac]/30">
      
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] rounded-full bg-[#95d4ac]/20 blur-[100px] pointer-events-none" />
      <div className="absolute right-[-10%] top-[20%] w-[30rem] h-[30rem] rounded-full bg-[#0f5132]/10 blur-[120px] pointer-events-none" />
      
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-white/40 shadow-sm transition-all">
        <div className="mx-auto w-full max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 min-w-0 group">
            <span className="w-8 h-8 rounded-xl overflow-hidden border border-[#0f5132]/10 shadow-sm shrink-0 transition-transform group-hover:scale-105">
              <Image src="/favicon.png" alt="" width={32} height={32} className="object-cover" />
            </span>
            <span className="text-lg font-bold tracking-tight text-[#0b1c30] truncate group-hover:text-[#0f5132] transition-colors">
              Grid Risk Command Center
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-semibold text-[#55554f] hover:text-[#0f5132] transition-colors shrink-0"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-[#0f5132] rounded-full hover:bg-[#003820] shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
            >
              Get Access
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {/* -- Hero -- */}
        <section className="mx-auto w-full max-w-6xl px-5 pt-20 pb-16 sm:pt-28 sm:pb-24 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0f5132]/5 border border-[#0f5132]/10 text-xs font-bold uppercase tracking-widest text-[#0f5132] mb-8 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-[#0f5132] animate-pulse" />
            Team Nirmaan &middot; IBM Bob AI Hackathon
          </div>
          <h1 className="max-w-4xl text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[#0b1c30] leading-[1.1] animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            Predict grid failures <br className="hidden sm:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0f5132] to-[#4caf75]">
              before they happen.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg sm:text-xl text-[#55554f] leading-relaxed animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            A decision-support console for electricity grid operators. Predict failures, explain every score with SHAP, rank by customer impact, and dispatch crews instantly.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <Link href="/overview" className="group flex items-center justify-center gap-2 px-8 py-4 text-base font-bold text-white bg-[#0f5132] rounded-full hover:bg-[#003820] shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              Open Operator Console
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-12 inline-flex items-start gap-3 max-w-3xl rounded-2xl border border-[#d97706]/20 bg-[#fffbeb] px-5 py-4 text-sm text-[#92400e] shadow-sm animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            <WarningAlt size={20} className="mt-0.5 shrink-0 text-[#d97706]" aria-hidden="true" />
            <span className="text-left">
              <strong className="font-bold">Simulation data only.</strong> There is no live SCADA connection behind this console. Every asset, reading, prediction and crew is simulated.
            </span>
          </div>
        </section>

        {/* -- Live figures -- */}
        <section aria-labelledby="figures-heading" className="relative bg-white/40 backdrop-blur-xl border-y border-white/50 py-12">
          <div className="mx-auto w-full max-w-6xl px-5 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 id="figures-heading" className="text-2xl font-bold tracking-tight text-[#0b1c30]">
                  Live Simulation Telemetry
                </h2>
                <p className="mt-1 text-sm text-[#55554f]">
                  Real-time data from the synthetic grid environment.
                </p>
              </div>
              <div className="text-xs font-mono text-[#0f5132] font-semibold bg-[#0f5132]/5 px-3 py-1.5 rounded-full border border-[#0f5132]/10">
                {stamp ? `SYS_CLOCK: ${stamp}` : "SYS_CLOCK: CONNECTING..."}
              </div>
            </div>

            {tiles.length > 0 ? (
              <dl className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {tiles.map((t) => (
                  <Stat key={t.label} label={t.label} value={t.value} />
                ))}
              </dl>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center p-12 bg-white/50 rounded-3xl border border-white/60 shadow-sm text-center">
                <div className="w-10 h-10 border-4 border-[#0f5132]/20 border-t-[#0f5132] rounded-full animate-spin mb-4" />
                <p className="text-[#55554f] font-medium">
                  Simulation dataset is warming up...
                </p>
              </div>
            )}
          </div>
        </section>

        {/* -- How it works -- */}
        <section aria-labelledby="how-heading" className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 id="how-heading" className="text-4xl font-extrabold tracking-tight text-[#0b1c30]">
              The Operator Workflow
            </h2>
            <p className="mt-4 text-lg text-[#55554f]">
              Five steps to secure the grid, precisely in the order an operator meets them.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, name, body }, i) => (
              <div key={name} className="group relative bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 shadow-sm p-8 hover:shadow-xl hover:bg-white transition-all duration-300 hover:-translate-y-2 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#95d4ac]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-bl-[100px]" />
                <div className="flex items-center gap-4 mb-6 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-[#0f5132]/5 text-[#0f5132] flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-[#0f5132] group-hover:text-white transition-all duration-300">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-[#0b1c30] flex items-center gap-2">
                    <span className="font-mono text-sm text-[#0f5132]/50 font-semibold bg-[#0f5132]/5 px-2 py-0.5 rounded-md">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {name}
                  </h3>
                </div>
                <p className="text-base text-[#55554f] leading-relaxed relative z-10 font-medium">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#0f5132]/10 bg-white/50 backdrop-blur-md relative z-10">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Image src="/favicon.png" alt="" width={24} height={24} className="opacity-80 grayscale" />
            <p className="text-sm font-medium text-[#55554f]">
              Grid Risk Command Center &copy; 2026 Team Nirmaan
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-6">
            <Link href="/overview" className="text-sm font-bold text-[#0f5132] hover:underline">
              Console
            </Link>
            <Link href="/login" className="text-sm font-bold text-[#55554f] hover:text-[#0f5132]">
              Sign in
            </Link>
            <Link href="/signup" className="text-sm font-bold text-[#55554f] hover:text-[#0f5132]">
              Register
            </Link>
          </nav>
        </div>
      </footer>
      
      {/* Global CSS for fade animations */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
