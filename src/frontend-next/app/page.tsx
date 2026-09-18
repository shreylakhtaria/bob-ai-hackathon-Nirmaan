import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Chemistry, MachineLearningModel, Meter, Radar, Tools, WarningAlt } from "@carbon/icons-react";

const description =
  "Grid Risk Command Center predicts electricity-grid equipment failures, explains " +
  "the drivers with SHAP, ranks them by customer impact, simulates outages and " +
  "dispatches crews. Runs entirely on simulation data.";

export const metadata: Metadata = {
  // `absolute` because the root template would otherwise append the product
  // name to a title that already carries it.
  title: {
    absolute: "Grid Risk Command Center — Predict, Explain and Prioritise Grid Failures",
  },
  description,
  alternates: { canonical: "/" },
};

/* -- Live figures ---------------------------------------------------------
   Every number on this page comes from the backend. Nothing here is a
   marketing figure, so when the API is unreachable or the database has not
   been seeded the band is simply not rendered: a blank is honest, an
   invented number is not. */

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
  // A server component cannot use the relative "/api" rewrite, so it talks to
  // the backend directly - the same target next.config.ts proxies the browser to.
  const base = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${base}/api/public/stats`, {
      cache: "no-store",
      // Without this an unreachable backend stalls the render (and the build)
      // until the platform's own timeout.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicStats;
    return data?.seeded ? data : null;
  } catch {
    return null;
  }
}

// Fixed locale: this renders on the server and hydrates on the client, and a
// server default of e.g. de-DE would produce "260.135" then flip to "260,135".
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US") : null;

const auc = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : null;

function asOf(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  // UTC, not the render machine's zone - again to keep server and client equal.
  return isNaN(d.getTime()) ? null : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const STEPS = [
  {
    icon: Radar,
    name: "Predict",
    body:
      "A LightGBM classifier scores every transformer and substation for failure " +
      "inside the prediction horizon, with an anomaly detector alongside it to catch " +
      "sensor behaviour the classifier has not been trained on.",
  },
  {
    icon: MachineLearningModel,
    name: "Explain",
    body:
      "SHAP attributes each score to its actual risk drivers, so an operator sees why " +
      "an asset is ranked where it is instead of being handed a bare number.",
  },
  {
    icon: Meter,
    name: "Prioritise",
    body:
      "The Grid Impact Score blends failure probability with asset criticality, " +
      "customers served, network exposure and weather, so the worst consequence rises " +
      "to the top rather than merely the highest probability.",
  },
  {
    icon: Chemistry,
    name: "Simulate",
    body:
      "What-if runs: take an asset out of service, or push a severe-weather scenario " +
      "across an area, and watch how risk and customer impact move.",
  },
  {
    icon: Tools,
    name: "Act",
    body:
      "Dispatch a crew, raise a work order and track it to completion without leaving " +
      "the console.",
  },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel rounded-xl border border-line shadow-panel px-4 py-3.5">
      <dt className="text-micro font-semibold uppercase tracking-[0.07em] text-ink-3">
        {label}
      </dt>
      <dd className="mt-2 font-mono text-metric font-semibold leading-none tracking-tight text-ink">
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
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto w-full max-w-5xl px-5 h-14 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg overflow-hidden border border-line shrink-0">
              <Image src="/favicon.png" alt="" width={28} height={28} className="object-cover" />
            </span>
            <span className="text-label font-semibold tracking-tight text-ink truncate">
              Grid Risk Command Center
            </span>
          </span>
          <Link
            href="/login"
            className="text-label font-medium text-ink-2 hover:text-ink hover:underline shrink-0"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* -- Hero -- */}
        <section className="mx-auto w-full max-w-5xl px-5 pt-12 pb-10 sm:pt-16">
          <p className="text-micro font-semibold uppercase tracking-[0.07em] text-ink-3">
            Team Nirmaan &middot; IBM Bob AI Hackathon
          </p>
          <h1 className="mt-3 max-w-3xl text-title sm:text-metric font-semibold tracking-tight text-ink leading-tight">
            Know which asset fails next &mdash; and how many customers are behind it.
          </h1>
          <p className="mt-4 max-w-2xl text-lede text-ink-2">
            A decision-support console for electricity grid operators: it predicts
            transformer and substation failures, explains every score, ranks the queue by
            customer impact, and carries the call through to a dispatched crew.
          </p>

          {/* Carbon's button styles applied to real links. This page is a
              server component on purpose — it is the only page a search engine
              or a cold visitor sees — so it cannot mount Carbon's client
              components. The `.cds--btn` classes are the same CSS those
              components emit, with no JavaScript. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/overview" className="cds--btn cds--btn--primary cds--btn--lg">
              Open console
              <ArrowRight size={20} className="cds--btn__icon" aria-hidden="true" />
            </Link>
            <Link href="/login" className="cds--btn cds--btn--tertiary cds--btn--lg">
              Sign in
            </Link>
          </div>

          {/* Said before anything else is claimed, not in the small print. */}
          <p className="mt-8 flex items-start gap-2.5 max-w-3xl rounded-xl border border-sev-watch/30 bg-sev-watch-tint px-4 py-3 text-body text-sev-watch">
            <WarningAlt size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Simulation data only.</strong> There is no
              live SCADA connection behind this console. Every asset, reading, prediction
              and crew is simulated, and nothing done here affects a real grid.
            </span>
          </p>
        </section>

        {/* -- Live figures -- */}
        <section aria-labelledby="figures-heading" className="border-y border-line bg-rail">
          <div className="mx-auto w-full max-w-5xl px-5 py-8">
            <h2 id="figures-heading" className="text-label font-semibold tracking-tight text-ink">
              Currently in the simulation
            </h2>

            {tiles.length > 0 ? (
              <>
                <dl className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
                  {tiles.map((t) => (
                    <Stat key={t.label} label={t.label} value={t.value} />
                  ))}
                </dl>
                <p className="mt-3 text-micro text-ink-3">
                  {[
                    stats?.model ? `Model: ${stats.model}` : null,
                    typeof stats?.prediction_horizon_hours === "number"
                      ? `${stats.prediction_horizon_hours}-hour prediction horizon`
                      : null,
                    stamp ? `Simulation clock ${stamp}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            ) : (
              // No fetch, no seed, no numbers. Nothing is invented to fill the gap.
              <p className="mt-2 text-body text-ink-3">
                Live figures are warming up &mdash; the simulation dataset has not reported
                yet. Open the console to see the current state.
              </p>
            )}
          </div>
        </section>

        {/* -- How it works -- */}
        <section aria-labelledby="how-heading" className="mx-auto w-full max-w-5xl px-5 py-12">
          <h2 id="how-heading" className="text-title font-semibold tracking-tight text-ink">
            How it works
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-2">
            Five steps, in the order an operator meets them.
          </p>

          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, name, body }, i) => (
              <li key={name} className="bg-panel rounded-xl border border-line shadow-panel p-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-8 h-8 rounded-lg bg-sunken text-ink-2 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <h3 className="text-label font-semibold tracking-tight text-ink">
                    <span className="font-mono text-micro text-ink-3 mr-1.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {name}
                  </h3>
                </div>
                <p className="mt-2.5 text-body text-ink-2">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-micro text-ink-3">
            Grid Risk Command Center &middot; Team Nirmaan &middot; Simulation data, no live
            SCADA feed.
          </p>
          <nav aria-label="Footer" className="flex items-center gap-4">
            <Link
              href="/overview"
              className="text-micro font-medium text-ink-2 hover:text-ink hover:underline"
            >
              Console
            </Link>
            <Link
              href="/login"
              className="text-micro font-medium text-ink-2 hover:text-ink hover:underline"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-micro font-medium text-ink-2 hover:text-ink hover:underline"
            >
              Register
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
