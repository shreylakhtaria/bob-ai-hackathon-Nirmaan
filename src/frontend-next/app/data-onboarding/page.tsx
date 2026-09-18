"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  DatabaseZap,
  UploadCloud,
  FileSpreadsheet,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { PanelCard } from "@/components/common/PanelCard";
import { useToast } from "@/context/ToastContext";
import { getAccessToken, refreshAccessToken } from "@/lib/api";

/* ──────────────────────────────────────────────────────────────────────────
   Types — mirror the report shape returned by backend/services/ingest.py.
   ────────────────────────────────────────────────────────────────────────── */
type Kind = "crews" | "assets";

interface RowError {
  row: number;
  field: string | null;
  message: string;
  value: string | null;
}

interface IngestReport {
  kind: Kind;
  total_rows: number;
  valid: number;
  invalid: number;
  duplicates: number;
  imported: number;
  unknown_columns: string[];
  errors: RowError[];
  preview: Record<string, string | number | null>[];
}

/* ──────────────────────────────────────────────────────────────────────────
   Column specs. Copied from `SPECS` in backend/services/ingest.py — if that
   file gains a column, this list has to follow it.
   ────────────────────────────────────────────────────────────────────────── */
const KIND_SPEC: Record<
  Kind,
  { label: string; blurb: string; required: string[]; optional: string[] }
> = {
  crews: {
    label: "Crews",
    blurb: "Field crews, their home area and availability.",
    required: ["crew_id"],
    optional: [
      "current_area",
      "latitude",
      "longitude",
      "skill_type",
      "availability",
      "equipment_capability",
      "base_response_min",
      "active_assignment",
    ],
  },
  assets: {
    label: "Assets",
    blurb: "Transformers, feeders and the rest of the plant register.",
    required: ["asset_id", "asset_type", "substation_id", "geographic_area"],
    optional: [
      "latitude",
      "longitude",
      "installation_year",
      "manufacturer",
      "rated_capacity",
      "criticality_score",
      "customers_served",
      "downstream_assets",
      "last_maintenance_date",
      "current_status",
    ],
  },
};

const KINDS = Object.keys(KIND_SPEC) as Kind[];

/** Matches config.MAX_UPLOAD_BYTES on the backend — reject locally so the
 *  operator isn't made to upload 40 MB only to be told 413. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Row-level errors can run to thousands. The table shows this many and then
 *  states the remainder out loud — nothing is silently dropped. */
const MAX_VISIBLE_ERRORS = 200;

/* ──────────────────────────────────────────────────────────────────────────
   Multipart upload.

   `apiRequest()` pins Content-Type to application/json, which would strip the
   multipart boundary and hand the backend an unparseable body. So this posts
   with fetch directly and replays the same rules lib/api.ts applies: in-memory
   bearer token, the double-submit CSRF header, credentials:include, one
   transparent refresh-and-retry on 401, and the {success,error:{...}} envelope
   unwrapped into a thrown Error carrying .code / .status.
   ────────────────────────────────────────────────────────────────────────── */
function csrfHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const hit = document.cookie.split("; ").find((c) => c.startsWith("grid_csrf="));
  return hit
    ? { "X-CSRF-Token": decodeURIComponent(hit.split("=").slice(1).join("=")) }
    : {};
}

async function uploadCsv(
  kind: Kind,
  file: File,
  mode: "validate" | "commit"
): Promise<IngestReport> {
  const body = new FormData();
  body.append("file", file); // field name fixed by main.py: `file: UploadFile = File(...)`

  const send = () => {
    const token = getAccessToken();
    return fetch(`/api/ingest/${kind}/${mode}`, {
      method: "POST",
      body,
      credentials: "include",
      // No Content-Type here on purpose: the browser must set its own boundary.
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...csrfHeader() },
    });
  };

  let res = await send();
  if (res.status === 401 && (await refreshAccessToken())) res = await send();

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const error = new Error(
      payload?.error?.message ?? payload?.detail ?? `Upload failed (${res.status})`
    ) as Error & { code?: string; status?: number };
    error.code = payload?.error?.code;
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/** Cheap local gate before we spend a round trip on a file that cannot work. */
function preCheck(file: File): string | null {
  if (!/\.csv$/i.test(file.name)) {
    return `"${file.name}" is not a .csv file. Export the sheet as CSV and try again.`;
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB — split it and import in batches.`;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────── */

export default function DataOnboardingPage() {
  const { ok, err, warn } = useToast();

  const [kind, setKind] = useState<Kind>("assets");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [report, setReport] = useState<IngestReport | null>(null);
  const [committed, setCommitted] = useState(false);
  const [busy, setBusy] = useState<null | "validate" | "commit">(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const spec = KIND_SPEC[kind];
  const canImport = !!report && !committed && report.valid > 0;

  const acceptFile = useCallback((picked: File | null) => {
    setReport(null);
    setCommitted(false);
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    const problem = preCheck(picked);
    setFileError(problem);
    setFile(problem ? null : picked);
  }, []);

  const reset = () => {
    acceptFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Changing target invalidates a report produced against the other schema.
  const chooseKind = (next: Kind) => {
    setKind(next);
    setReport(null);
    setCommitted(false);
  };

  const run = async (mode: "validate" | "commit") => {
    if (!file) return;
    setBusy(mode);
    try {
      const result = await uploadCsv(kind, file, mode);
      setReport(result);
      if (mode === "commit") {
        setCommitted(true);
        ok(`Imported ${result.imported} ${kind} row${result.imported === 1 ? "" : "s"}.`);
      } else if (result.valid === 0) {
        warn(`No importable rows — ${result.invalid} invalid, ${result.duplicates} duplicate.`);
      } else {
        ok(`${result.valid} of ${result.total_rows} rows are ready to import.`);
      }
    } catch (e) {
      setReport(null);
      err((e as Error).message || "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const previewColumns = useMemo(() => {
    if (!report?.preview?.length) return [];
    const seen = new Set<string>();
    report.preview.forEach((row) => Object.keys(row).forEach((k) => seen.add(k)));
    return [...seen];
  }, [report]);

  const hiddenErrors = report ? Math.max(0, report.errors.length - MAX_VISIBLE_ERRORS) : 0;

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* ── Header ── */}
      <div className="pb-2 border-b border-line">
        <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
          <span>Data</span>
          <span className="text-line">/</span>
          <span className="text-brand-ink font-bold">Onboarding</span>
        </div>
        <h1 className="text-title font-bold text-ink tracking-tight">Data Onboarding</h1>
        <p className="text-label text-ink-2 max-w-3xl">
          Load crew and asset records into the console from a CSV. Every file is validated as a dry
          run first, so you see which rows would be written before any of them are.
        </p>
      </div>

      {/* ── The distinction that matters: this page writes, analysis does not ── */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line border-l-[3px] border-l-sev-elevated bg-panel p-3.5 shadow-panel">
          <div className="flex items-center gap-2 mb-1">
            <DatabaseZap className="w-4 h-4 text-sev-elevated shrink-0" aria-hidden="true" />
            <h2 className="text-label font-semibold text-ink">
              Bulk CSV import — writes to the database
            </h2>
          </div>
          <p className="text-micro text-ink-2">
            What you do on this page. Committed rows become permanent records in the operational
            store, visible to every operator, on the map, and in exports. The import is audit-logged
            against your account.
          </p>
        </div>

        <div className="rounded-xl border border-line border-l-[3px] border-l-brand bg-panel p-3.5 shadow-panel">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
            <h2 className="text-label font-semibold text-ink">
              Ad-hoc AI dataset analysis — writes nothing
            </h2>
          </div>
          <p className="text-micro text-ink-2">
            A separate workflow. Files handed to the AI analyst are read for questions and summaries
            only; nothing from them enters the database, the grid model or any export. If you want
            records in the system, they have to come through the import on the left.
          </p>
        </div>
      </div>

      {/* ── Step 1: target ── */}
      <PanelCard
        title="1 · Import target"
        hint="Each target has its own required columns."
        icon={<DatabaseZap className="w-4 h-4" />}
      >
        <fieldset
          disabled={busy !== null}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
        >
          <legend className="sr-only">Choose which table to import into</legend>
          <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5 self-start">
            {KINDS.map((k) => (
              <label key={k} className="cursor-pointer">
                <input
                  type="radio"
                  name="ingest-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => chooseKind(k)}
                  className="sr-only peer"
                />
                <span className="block rounded-md px-4 py-1.5 text-label font-semibold text-ink-2 peer-checked:bg-panel peer-checked:text-ink peer-checked:shadow-panel peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                  {KIND_SPEC[k].label}
                </span>
              </label>
            ))}
          </div>
          <p className="text-micro text-ink-3">{spec.blurb}</p>
        </fieldset>
      </PanelCard>

      {/* ── Step 2: file + format help ── */}
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PanelCard
          title="2 · CSV file"
          hint="Drop a file, or press Enter on the dropzone to browse. Max 5 MB."
          icon={<UploadCloud className="w-4 h-4" />}
        >
          {/* The <label> is the dropzone; the real file input lives inside it,
              visually hidden but still focusable — so Tab reaches it and
              Enter/Space opens the picker with no keydown handler of our own. */}
          <label
            htmlFor="csv-file"
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (busy) return;
              acceptFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
              busy
                ? "cursor-not-allowed border-line bg-sunken opacity-60"
                : dragging
                  ? "cursor-copy border-brand bg-sev-normal-tint"
                  : "cursor-pointer border-line-strong bg-sunken hover:border-brand hover:bg-panel"
            }`}
          >
            <input
              id="csv-file"
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={busy !== null}
              className="sr-only"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
            <UploadCloud className="w-7 h-7 text-ink-3" aria-hidden="true" />
            <span className="text-body font-semibold text-ink">
              Drop a {spec.label.toLowerCase()} CSV here
            </span>
            <span className="text-micro text-ink-3">
              or press Enter to choose a file · .csv only · up to 5 MB
            </span>
          </label>

          {fileError && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-sev-critical/30 bg-sev-critical-tint px-3 py-2 text-micro font-medium text-sev-critical"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              {fileError}
            </p>
          )}

          {file && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
              <FileSpreadsheet className="w-4 h-4 text-brand-ink shrink-0" aria-hidden="true" />
              <span className="font-mono text-micro font-semibold text-ink break-all">
                {file.name}
              </span>
              <span className="font-mono text-micro text-ink-3">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          )}

          {/* ── Step 3: actions ── */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            <button
              type="button"
              onClick={() => run("validate")}
              disabled={!file || busy !== null || committed}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-label font-semibold text-white hover:opacity-90"
            >
              {busy === "validate" ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              )}
              {busy === "validate" ? "Validating…" : "Validate (dry run)"}
            </button>

            <button
              type="button"
              onClick={() => run("commit")}
              disabled={!canImport || busy !== null}
              title={
                canImport
                  ? undefined
                  : "Validate the file first — an import needs at least one valid row."
              }
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-sev-elevated px-3.5 text-label font-semibold text-white hover:opacity-90"
            >
              {busy === "commit" ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <DatabaseZap className="w-4 h-4" aria-hidden="true" />
              )}
              {busy === "commit"
                ? "Importing…"
                : report && !committed
                  ? `Import ${report.valid} row${report.valid === 1 ? "" : "s"}`
                  : "Import"}
            </button>

            <button
              type="button"
              onClick={reset}
              disabled={busy !== null}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3.5 text-label font-medium text-ink hover:bg-sunken"
            >
              <RotateCcw className="w-4 h-4 text-ink-3" aria-hidden="true" />
              Clear &amp; start over
            </button>
          </div>
          <p className="mt-2 text-micro text-ink-3">
            Validation writes nothing. Only <strong className="text-ink-2">Import</strong> touches
            the database, and it writes the valid rows only.
          </p>
        </PanelCard>

        {/* ── CSV format helper ── */}
        <PanelCard
          title="CSV format"
          hint={`Header row required · ${spec.label.toLowerCase()}`}
          icon={<FileSpreadsheet className="w-4 h-4" />}
        >
          <h3 className="text-micro font-semibold uppercase tracking-wider text-ink-3">
            Required columns
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {spec.required.map((c) => (
              <li
                key={c}
                className="rounded border border-sev-critical/25 bg-sev-critical-tint px-1.5 py-0.5 font-mono text-micro font-semibold text-sev-critical"
              >
                {c}
              </li>
            ))}
          </ul>

          <h3 className="mt-3.5 text-micro font-semibold uppercase tracking-wider text-ink-3">
            Optional columns
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {spec.optional.map((c) => (
              <li
                key={c}
                className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-micro text-ink-2"
              >
                {c}
              </li>
            ))}
          </ul>

          <p className="mt-3.5 border-t border-line pt-3 text-micro text-ink-3">
            UTF-8, comma-separated, one header row. Columns may appear in any order; anything not
            listed above is reported back as an unknown column and ignored. Rows whose{" "}
            <code className="font-mono text-ink-2">{spec.required[0]}</code> already exists are
            counted as duplicates and skipped.
          </p>
        </PanelCard>
      </div>

      {/* ── Report ── */}
      <div aria-live="polite" aria-busy={busy !== null}>
        {report && (
          <div className="flex flex-col gap-3.5">
            <PanelCard
              title={committed ? "Import complete" : "Validation report (dry run — nothing written)"}
              icon={
                committed ? <CheckCircle2 className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />
              }
              hint={
                committed
                  ? `${report.imported} row${report.imported === 1 ? "" : "s"} written to ${report.kind}.`
                  : report.valid > 0
                    ? `${report.valid} row${report.valid === 1 ? "" : "s"} would be written to ${report.kind}.`
                    : "No row in this file can be imported."
              }
            >
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
                {(
                  [
                    ["Total rows", report.total_rows, "text-ink"],
                    ["Valid", report.valid, "text-sev-normal"],
                    ["Invalid", report.invalid, "text-sev-critical"],
                    ["Duplicates", report.duplicates, "text-sev-watch"],
                    ...(committed
                      ? [["Imported", report.imported, "text-brand"] as [string, number, string]]
                      : []),
                  ] as [string, number, string][]
                ).map(([label, value, tone]) => (
                  <div key={label} className="rounded-lg border border-line bg-sunken px-3 py-2">
                    <dt className="text-micro uppercase tracking-wider text-ink-3">{label}</dt>
                    <dd className={`font-mono text-metric font-bold leading-tight ${tone}`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {report.unknown_columns.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-sev-watch/30 bg-sev-watch-tint px-3 py-2 text-micro text-sev-watch">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="font-semibold">
                    {report.unknown_columns.length} unknown column
                    {report.unknown_columns.length === 1 ? "" : "s"} ignored:
                  </span>
                  {report.unknown_columns.map((c) => (
                    <code key={c} className="font-mono font-semibold">
                      {c}
                    </code>
                  ))}
                </p>
              )}

              {committed && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-sev-normal/30 bg-sev-normal-tint px-3 py-2 text-micro font-medium text-sev-normal">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                  {report.imported} row{report.imported === 1 ? "" : "s"} are now live in{" "}
                  {report.kind}. Clear and start over to import another file.
                </p>
              )}
            </PanelCard>

            {report.preview.length > 0 && (
              <PanelCard
                title={`Preview · first ${report.preview.length} importable row${report.preview.length === 1 ? "" : "s"}`}
                hint="Values exactly as they would be stored."
                flush
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-label">
                    <thead>
                      <tr className="border-b border-line bg-sunken text-micro uppercase tracking-wider text-ink-2">
                        {previewColumns.map((c) => (
                          <th
                            key={c}
                            scope="col"
                            className="whitespace-nowrap px-3 py-2.5 font-mono"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sunken">
                      {report.preview.map((row, i) => (
                        <tr key={i}>
                          {previewColumns.map((c) => (
                            <td
                              key={c}
                              className="whitespace-nowrap px-3 py-2 font-mono text-micro text-ink"
                            >
                              {row[c] == null || row[c] === "" ? (
                                <span className="text-ink-3">—</span>
                              ) : (
                                String(row[c])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PanelCard>
            )}

            {report.errors.length > 0 && (
              <PanelCard
                title={`Rejected rows · ${report.errors.length}`}
                icon={<AlertTriangle className="w-4 h-4" />}
                hint={
                  hiddenErrors > 0
                    ? `Showing the first ${MAX_VISIBLE_ERRORS} — ${hiddenErrors} more are not listed.`
                    : "Every rejected row is listed. Fix the file and validate again."
                }
                flush
              >
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-left text-label">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-line bg-sunken text-micro uppercase tracking-wider text-ink-2">
                        <th scope="col" className="px-3 py-2.5 w-16">
                          Row
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Field
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Problem
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sunken">
                      {report.errors.slice(0, MAX_VISIBLE_ERRORS).map((e, i) => (
                        <tr key={`${e.row}-${e.field}-${i}`} className="hover:bg-sunken">
                          <td className="px-3 py-2 font-mono text-micro font-bold text-ink">
                            {e.row}
                          </td>
                          <td className="px-3 py-2 font-mono text-micro text-brand-ink">
                            {e.field ?? <span className="text-ink-3">—</span>}
                          </td>
                          <td className="px-3 py-2 text-micro text-ink-2">{e.message}</td>
                          <td className="px-3 py-2 font-mono text-micro text-ink-3 break-all">
                            {e.value == null || e.value === "" ? "—" : e.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hiddenErrors > 0 && (
                  <p className="border-t border-line bg-sev-watch-tint px-3 py-2 text-micro font-semibold text-sev-watch">
                    {hiddenErrors} further rejected row{hiddenErrors === 1 ? "" : "s"} are not shown
                    here. They are rejected all the same — correct the file and validate again to
                    work through the rest.
                  </p>
                )}
              </PanelCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
