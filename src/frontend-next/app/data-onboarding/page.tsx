"use client";

// Carbon's *pre-compiled* CSS (not the .scss source) — this repo's Next.js
// build has a Turbopack/Sass module-resolution issue with @carbon/react's
// `@forward 'scss/config'`-style partial imports from inside node_modules,
// so the plain CSS bundle sidesteps that entirely. It's imported only here
// rather than in the root layout, so the rest of the app keeps its existing
// Tailwind-based look untouched.
import "@carbon/styles/css/styles.min.css";
import React, { useRef, useState } from "react";
import {
  Button,
  InlineNotification,
  TextInput,
  NumberInput,
  Select,
  SelectItem,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  Loading,
} from "@carbon/react";
import { Upload, Download, RotateCw, DatabaseZap, PlusCircle } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import type { AssetRecordInput, IngestCsvResponse } from "@/types/grid";

// Mirrors backend/config.py — the backend has no endpoint that serves these
// lists, so they're kept in sync here the same way the map's area centroids
// already are (components/map/GridMapClient.tsx).
const ASSET_TYPES = ["Transformer", "CircuitBreaker", "Substation", "Switchgear", "Feeder"];
const GEO_AREAS = ["NORTH-04", "NORTH-01", "SOUTH-02", "EAST-03", "WEST-05", "CENTRAL-00"];

const EMPTY_ASSET: AssetRecordInput = {
  asset_id: "",
  asset_type: ASSET_TYPES[0],
  substation_id: "",
  geographic_area: GEO_AREAS[0],
  latitude: 23.05,
  longitude: 72.58,
  customers_served: 500,
  criticality_score: 5,
  installation_year: 2015,
  rated_capacity: 100,
};

export default function DataOnboardingPage() {
  const { ok, err, info } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<IngestCsvResponse | null>(null);

  const [singleAsset, setSingleAsset] = useState<AssetRecordInput>(EMPTY_ASSET);
  const [savingAsset, setSavingAsset] = useState(false);

  const [rescoring, setRescoring] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setCsvResult(null);
    try {
      const res = await API.ingestAssetsCsv(selectedFile);
      setCsvResult(res);
      if (res.errors.length === 0) {
        ok(`Imported ${res.inserted} new asset(s), updated ${res.updated} existing`);
      } else {
        info(`Imported ${res.inserted + res.updated} row(s), ${res.errors.length} rejected — see the table below`);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      err(e.message || "CSV import failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSingleAssetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAsset(true);
    try {
      const res = await API.ingestAssetSingle(singleAsset);
      ok(`${res.asset_id} ${res.inserted ? "created" : "updated"}`);
      setSingleAsset({ ...EMPTY_ASSET });
    } catch (e: any) {
      err(e.message || "Failed to save asset");
    } finally {
      setSavingAsset(false);
    }
  };

  const handleSeedTelemetry = async () => {
    setSeeding(true);
    info("Backfilling synthetic sensor history for un-onboarded assets and re-scoring…");
    try {
      const res = await API.seedTelemetry();
      if (res.rows_inserted === 0) {
        info(res.message || "No assets needed backfill");
      } else {
        ok(`Seeded ${res.rows_inserted.toLocaleString()} sensor rows across ${res.seeded} asset(s)` +
          (res.scored != null ? ` — ${res.scored} assets now scored` : ""));
      }
    } catch (e: any) {
      err(e.message || "Telemetry seeding failed");
    } finally {
      setSeeding(false);
    }
  };

  const handleRescore = async () => {
    setRescoring(true);
    info("Re-running the ML pipeline…");
    try {
      const res = await API.reScore();
      ok(`Rescan complete — ${res.scored} assets scored, ${res.areas_updated} areas updated`);
    } catch (e: any) {
      err(e.message || "Rescan failed");
    } finally {
      setRescoring(false);
    }
  };

  const errorHeaders = [
    { key: "row", header: "CSV Row" },
    { key: "reason", header: "Reason" },
  ];
  const errorRows = (csvResult?.errors || []).map((e) => ({
    id: String(e.row),
    row: e.row,
    reason: e.reason,
  }));

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Data Management</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Data Onboarding</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Asset &amp; Telemetry Data Onboarding
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Bulk-import assets by CSV, add a single asset manually, backfill synthetic sensor history,
            and trigger a full model rescan &mdash; all against the live SIMULATION DATA database.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* CSV bulk import */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#003820]" />
                <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
                  Bulk Asset Import (CSV)
                </span>
              </div>
              <a
                href={API.ingestTemplateUrl()}
                download
                className="font-mono text-[10.5px] text-[#0f5132] font-bold hover:underline flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Download template
              </a>
            </div>

            <div className="p-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="flex-1 text-[12px] font-mono file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-[#c0c9c0] file:bg-[#eff4ff] file:text-[#0b1c30] file:text-[11px] file:font-bold hover:file:bg-[#dce9ff]"
                />
                <Button
                  kind="primary"
                  size="md"
                  disabled={!selectedFile || uploading}
                  onClick={handleUpload}
                  renderIcon={uploading ? undefined : Upload}
                >
                  {uploading ? <Loading small withOverlay={false} description="Uploading" /> : "Upload & Import"}
                </Button>
              </div>

              {csvResult && (
                <>
                  <InlineNotification
                    kind={csvResult.errors.length === 0 ? "success" : "warning"}
                    lowContrast
                    hideCloseButton
                    title={csvResult.errors.length === 0 ? "Import complete" : "Import completed with rejected rows"}
                    subtitle={`${csvResult.inserted} inserted, ${csvResult.updated} updated, ${csvResult.errors.length} rejected`}
                  />
                  {errorRows.length > 0 && (
                    <TableContainer title="Rejected rows" description="Fix these rows and re-upload">
                      <DataTable rows={errorRows} headers={errorHeaders}>
                        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }: any) => (
                          <Table {...getTableProps()} size="sm">
                            <TableHead>
                              <TableRow>
                                {headers.map((header: any) => (
                                  <TableHeader {...getHeaderProps({ header })} key={header.key}>
                                    {header.header}
                                  </TableHeader>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row: any) => (
                                <TableRow {...getRowProps({ row })} key={row.id}>
                                  {row.cells.map((cell: any) => (
                                    <TableCell key={cell.id}>{cell.value}</TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </DataTable>
                    </TableContainer>
                  )}
                </>
              )}

              <p className="text-[10.5px] text-[#707971] font-mono">
                Re-uploading an existing asset_id updates that row (upsert) rather than duplicating it.
              </p>
            </div>
          </div>

          {/* Telemetry / rescore actions */}
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5 flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-1 border-b border-[#c0c9c0]/40">
              <DatabaseZap className="w-4 h-4 text-[#003820]" />
              <span className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30]">
                Telemetry Backfill &amp; Model Rescan
              </span>
            </div>
            <p className="text-[12px] text-[#404942]">
              Newly onboarded assets have no sensor history, so the ML model can&apos;t score them until
              some exists. Seed synthetic telemetry for them, then rescan to generate predictions.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button kind="tertiary" size="md" disabled={seeding} onClick={handleSeedTelemetry} renderIcon={DatabaseZap}>
                {seeding ? "Seeding…" : "Seed Telemetry for New Assets"}
              </Button>
              <Button kind="secondary" size="md" disabled={rescoring} onClick={handleRescore} renderIcon={RotateCw}>
                {rescoring ? "Rescanning…" : "Force Re-score Now"}
              </Button>
            </div>
          </div>
        </div>

        {/* Single asset add/update */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2 bg-[#dce9ff] flex items-center gap-2 border-b border-[#c0c9c0]/50">
              <PlusCircle className="w-4 h-4 text-[#003820]" />
              <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
                Add / Update Single Asset
              </span>
            </div>

            <form onSubmit={handleSingleAssetSubmit} className="p-3.5 flex flex-col gap-3">
              <TextInput
                id="asset_id"
                labelText="Asset ID"
                value={singleAsset.asset_id}
                onChange={(e) => setSingleAsset({ ...singleAsset, asset_id: e.target.value })}
                required
              />
              <Select
                id="asset_type"
                labelText="Asset Type"
                value={singleAsset.asset_type}
                onChange={(e) => setSingleAsset({ ...singleAsset, asset_type: e.target.value })}
              >
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t} value={t} text={t} />
                ))}
              </Select>
              <TextInput
                id="substation_id"
                labelText="Substation ID"
                value={singleAsset.substation_id}
                onChange={(e) => setSingleAsset({ ...singleAsset, substation_id: e.target.value })}
                required
              />
              <Select
                id="geographic_area"
                labelText="Geographic Area"
                value={singleAsset.geographic_area}
                onChange={(e) => setSingleAsset({ ...singleAsset, geographic_area: e.target.value })}
              >
                {GEO_AREAS.map((a) => (
                  <SelectItem key={a} value={a} text={a} />
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  id="latitude"
                  label="Latitude"
                  value={singleAsset.latitude}
                  step={0.01}
                  onChange={(_e: any, { value }: any) => setSingleAsset({ ...singleAsset, latitude: Number(value) })}
                />
                <NumberInput
                  id="longitude"
                  label="Longitude"
                  value={singleAsset.longitude}
                  step={0.01}
                  onChange={(_e: any, { value }: any) => setSingleAsset({ ...singleAsset, longitude: Number(value) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  id="customers_served"
                  label="Customers Served"
                  value={singleAsset.customers_served}
                  min={0}
                  onChange={(_e: any, { value }: any) =>
                    setSingleAsset({ ...singleAsset, customers_served: Number(value) })
                  }
                />
                <NumberInput
                  id="criticality_score"
                  label="Criticality (0-10)"
                  value={singleAsset.criticality_score}
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={(_e: any, { value }: any) =>
                    setSingleAsset({ ...singleAsset, criticality_score: Number(value) })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  id="installation_year"
                  label="Installation Year"
                  value={singleAsset.installation_year}
                  min={1900}
                  max={2100}
                  onChange={(_e: any, { value }: any) =>
                    setSingleAsset({ ...singleAsset, installation_year: Number(value) })
                  }
                />
                <NumberInput
                  id="rated_capacity"
                  label="Rated Capacity"
                  value={singleAsset.rated_capacity}
                  // No `min` here: min=0.01 + step=0.1 puts the HTML5 step
                  // grid at 0.01, 0.11, 0.21… which a value like 100 never
                  // lands on — that silently fails native constraint
                  // validation and blocks submission with no visible error.
                  // The backend enforces rated_capacity > 0 (Pydantic gt=0.0).
                  step={0.1}
                  onChange={(_e: any, { value }: any) =>
                    setSingleAsset({ ...singleAsset, rated_capacity: Number(value) })
                  }
                />
              </div>

              <Button type="submit" kind="primary" disabled={savingAsset} className="mt-1">
                {savingAsset ? "Saving…" : "Save Asset"}
              </Button>
              <Tag type="gray" size="sm">
                Upsert by asset_id — existing assets are updated, not duplicated
              </Tag>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
