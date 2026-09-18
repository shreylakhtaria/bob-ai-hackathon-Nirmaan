"use client";

import React, { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Cpu,
  Search,
  ChevronRight,
  Send,
  Sliders,
  RotateCw,
} from "lucide-react";
import { DriverStrip } from "@/components/common/DriverStrip";
import { RiskBadge } from "@/components/common/RiskBadge";
import { DebouncedInput } from "@/components/common/DebouncedInput";
import { SensorChartModal } from "@/components/sensors/SensorChartModal";
import { AssetSensorFeeds } from "@/components/sensors/AssetSensorFeeds";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import type { AssetDetailResponse } from "@/types/grid";

const PAGE_SIZE = 12;

export default function AssetsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get("assetId") || "";
  const initialQuery = searchParams.get("q") || "";

  const { ok, err } = useToast();

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [areaFilter, setAreaFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priFilter, setPriFilter] = useState("");
  const [page, setPage] = useState(0);

  const [selectedAssetId, setSelectedAssetId] = useState<string>(initialAssetId || "T-1024");
  const [modalSensor, setModalSensor] = useState<any>(null);

  const { data: assets = [], isLoading, refetch } = useQuery({
    queryKey: ["assets-list"],
    queryFn: () => API.assets("?limit=500"),
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => API.areas(),
  });

  const { data: assetDetail, isLoading: isDetailLoading } = useQuery<AssetDetailResponse>({
    queryKey: ["asset-detail", selectedAssetId],
    queryFn: () => API.asset(selectedAssetId),
    enabled: !!selectedAssetId,
  });

  // Extract unique types and area IDs
  const assetTypes = useMemo(() => [...new Set(assets.map((a) => a.asset_type).filter(Boolean))], [assets]);
  const areaIds = useMemo(() => (areas || []).map((a) => a.area_id), [areas]);

  // Multi-field filtered list
  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return assets.filter((a) => {
      const matchQ =
        !q ||
        (a.asset_id || "").toUpperCase().includes(q) ||
        (a.geographic_area || a.area || "").toUpperCase().includes(q) ||
        (a.substation_id || "").toUpperCase().includes(q) ||
        (a.substation || "").toUpperCase().includes(q) ||
        (a.serial_number || "").toUpperCase().includes(q) ||
        (a.asset_type || "").toUpperCase().includes(q) ||
        (a.manufacturer || "").toUpperCase().includes(q) ||
        (a.current_status || "").toUpperCase().includes(q);

      const matchArea = !areaFilter || a.geographic_area === areaFilter || a.area === areaFilter;
      const matchType = !typeFilter || a.asset_type === typeFilter;
      const matchPri = !priFilter || a.priority === priFilter;

      return matchQ && matchArea && matchType && matchPri;
    });
  }, [assets, searchQuery, areaFilter, typeFilter, priFilter]);

  const totalPages = Math.ceil(filteredAssets.length / PAGE_SIZE) || 1;
  const paginatedAssets = filteredAssets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleDispatch = async (assetId: string) => {
    try {
      const res = await API.dispatch(assetId);
      ok(res.message || `Dispatched crew to ${assetId}`);
      refetch();
    } catch (e: any) {
      err(e.message || "Dispatch failed");
    }
  };

  if (isLoading) {
    return <ScadaSkeletonLoader />;
  }

  const p = assetDetail?.prediction;
  const a = assetDetail?.asset;
  const fp = (p?.failure_probability || a?.failure_probability || 0) * 100;
  const lvl = p?.priority || a?.priority || "LOW";

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Substation Ops</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Health Register &amp; Diagnostics</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Assets Register &amp; Health Diagnostics
          </h1>
          <p className="text-label text-ink-2">
            Comprehensive electrical infrastructure register, sensor telemetry, and diagnostic health indexing.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="min-h-9 px-3.5 bg-panel text-ink border border-line rounded-lg font-mono text-micro font-bold hover:bg-sunken transition-colors flex items-center gap-1.5 shadow-panel self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-brand-ink" /> Force SCADA Resync
        </button>
      </div>

      {/* Filter Ribbon */}
      <div className="bg-panel p-3.5 rounded-xl shadow-panel border border-line">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
          <div className="md:col-span-4">
            <DebouncedInput
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setPage(0);
              }}
              placeholder="Filter by Asset ID, Substation, Serial Number…"
            />
          </div>
          <div className="md:col-span-2">
            <select
              value={areaFilter}
              onChange={(e) => {
                setAreaFilter(e.target.value);
                setPage(0);
              }}
              className="w-full min-h-9 px-2 bg-sunken text-ink text-label font-mono rounded-lg border border-line"
            >
              <option value="">All Areas</option>
              {areaIds.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              className="w-full min-h-9 px-2 bg-sunken text-ink text-label font-mono rounded-lg border border-line"
            >
              <option value="">All Asset Types</option>
              {assetTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <select
              value={priFilter}
              onChange={(e) => {
                setPriFilter(e.target.value);
                setPage(0);
              }}
              className="w-full min-h-9 px-2 bg-sunken text-ink text-label font-mono font-medium rounded-lg border border-line"
            >
              <option value="">All Risk Tiers</option>
              <option value="CRITICAL">Critical Risk (&gt;85%)</option>
              <option value="HIGH">High Risk (60-85%)</option>
              <option value="MEDIUM">Medium Risk (25-60%)</option>
              <option value="LOW">Nominal (&lt;25%)</option>
            </select>
          </div>
          <div className="md:col-span-2 flex items-center justify-end font-mono text-micro text-ink-3">
            {filteredAssets.length} assets shown
          </div>
        </div>
      </div>

      {/* Main Split Layout: Table (7 cols) + Diagnostics Drawer (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Table View */}
        <div className="lg:col-span-7 bg-panel rounded-xl shadow-panel border border-line overflow-hidden flex flex-col justify-between">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-label">
              <thead>
                <tr className="bg-sunken text-ink-2 text-micro uppercase tracking-wider border-b border-line">
                  <th className="py-2.5 px-3">Asset ID</th>
                  <th className="py-2.5 px-3">Type &amp; Substation</th>
                  <th className="py-2.5 px-3">Risk Tier</th>
                  <th className="py-2.5 px-3">P(Failure)</th>
                  <th className="py-2.5 px-3 text-right">Impact</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sunken">
                {paginatedAssets.map((asset) => {
                  const isSelected = asset.asset_id === selectedAssetId;
                  return (
                    <tr
                      key={asset.asset_id}
                      onClick={() => setSelectedAssetId(asset.asset_id)}
                      className={`hover:bg-sunken cursor-pointer transition-colors ${
                        isSelected ? "bg-sev-normal-tint/20 font-semibold" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1 h-4 rounded-full ${isSelected ? "bg-brand-ink" : "bg-transparent"}`}
                          />
                          <span className="font-mono font-bold text-brand-ink">{asset.asset_id}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ink text-label">{asset.asset_type}</div>
                        <div className="text-micro text-ink-3 font-mono">
                          {asset.geographic_area || asset.area}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <RiskBadge level={asset.priority || "LOW"} />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-mono text-micro font-bold text-sev-critical">
                          {F.pct(asset.failure_probability)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                        {F.score(asset.grid_impact_score)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-micro px-1.5 py-0.5 bg-sunken text-ink-2 rounded uppercase">
                          {asset.current_status || "IN_SERVICE"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-ink-3 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-3 py-2 bg-canvas border-t border-line flex items-center justify-between font-mono text-micro text-ink-2">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-2.5 py-1 bg-panel border border-line rounded disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="px-2.5 py-1 bg-panel border border-line rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostics Drawer (5 cols) */}
        <div className="lg:col-span-5 bg-panel rounded-xl shadow-panel border border-line p-3.5 flex flex-col gap-3">
          {isDetailLoading || !assetDetail ? (
            <div className="p-8 text-center font-mono text-micro text-ink-3">
              <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-ink" />
              Loading asset telemetry…
            </div>
          ) : (
            <>
              {/* Asset Identity Card */}
              <div className="flex items-start justify-between pb-2 border-b border-line">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lede font-bold text-brand-ink font-mono">{a?.asset_id}</h2>
                    <RiskBadge level={lvl} />
                  </div>
                  <div className="text-micro text-ink-2">
                    {a?.asset_type} &bull; {a?.geographic_area || a?.area} &bull; {F.num(a?.customers_served)} customers
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lede font-bold text-sev-critical">
                    {fp.toFixed(1)}%
                  </div>
                  <div className="text-micro text-ink-3 uppercase">Failure Probability</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-micro">
                <button
                  onClick={() => handleDispatch(selectedAssetId)}
                  className="min-h-8 bg-sev-critical text-white font-semibold rounded uppercase hover:opacity-90 flex items-center justify-center gap-1 shadow-panel"
                >
                  <Send className="w-3 h-3" /> Dispatch
                </button>
                <button
                  onClick={() => router.push(`/simulation?asset=${selectedAssetId}`)}
                  className="min-h-8 bg-sunken text-ink border border-line font-semibold rounded uppercase hover:bg-header flex items-center justify-center gap-1"
                >
                  <Sliders className="w-3 h-3" /> Simulate
                </button>
                <button
                  onClick={() => ok(`Diagnostics for ${selectedAssetId} copied to clipboard`)}
                  className="min-h-8 bg-sunken text-ink border border-line font-semibold rounded uppercase hover:bg-header flex items-center justify-center gap-1"
                >
                  Export Log
                </button>
              </div>

              {/* Sensor Telemetry */}
              <AssetSensorFeeds 
                assetId={selectedAssetId} 
                sensorsSummary={assetDetail.sensors_summary || {}}
                onSensorClick={(s) => setModalSensor(s)}
              />

              {/* ── Why this asset is at risk ──
                  This is the product's actual claim: not just a score but the
                  reason behind it. It used to render as four lines of
                  "label · val: 3.2 · z=1.8", which is the model's vocabulary,
                  not an operator's. Now the contribution is drawn, the biggest
                  driver reads first, and the raw figures sit underneath for
                  anyone who wants them. */}
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-label font-semibold text-ink">Why this asset is at risk</h3>
                  <span className="text-micro text-ink-3">Model drivers (SHAP)</span>
                </div>

                <DriverStrip
                  level={p?.risk_level || p?.priority}
                  showLegend={false}
                  className="mb-3"
                  drivers={(p?.shap_factors || []).map((f) => ({
                    name: f.label,
                    value: Number(f.shap ?? f.importance ?? f.z ?? 0),
                  }))}
                />

                <ul className="space-y-2">
                  {(p?.shap_factors || []).slice(0, 4).map((f, i) => {
                    const factors = p?.shap_factors || [];
                    const mags = factors.map((x) =>
                      Math.abs(Number(x.shap ?? x.importance ?? x.z ?? 0))
                    );
                    const max = Math.max(...mags, 1);
                    const mag = Math.abs(Number(f.shap ?? f.importance ?? f.z ?? 0));
                    const { ink } = F.sev(p?.risk_level || p?.priority);
                    return (
                      <li key={i}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-label text-ink truncate">{f.label}</span>
                          <span className="font-mono text-micro text-ink-3 shrink-0">
                            {f.value}
                            {f.z != null && <span className="text-line-strong"> · z {f.z}</span>}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-sunken overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(3, (mag / max) * 100)}%`,
                              backgroundColor: ink,
                              opacity: 1 - i * 0.18,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {!(p?.shap_factors || []).length && (
                  <p className="text-label text-ink-3">
                    No driver breakdown available for this asset yet.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sensor Chart Modal */}
      {modalSensor && (
        <SensorChartModal
          isOpen={!!modalSensor}
          onClose={() => setModalSensor(null)}
          label={modalSensor.label}
          value={modalSensor.latest || modalSensor.value}
          unit={modalSensor.unit}
          status={modalSensor.status}
          threshold={modalSensor.threshold}
          trend={modalSensor.trend}
        />
      )}
    </div>
  );
}
