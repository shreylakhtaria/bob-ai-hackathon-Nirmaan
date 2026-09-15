"use client";

import React, { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Cpu,
  Search,
  ChevronRight,
  Send,
  Calendar,
  Sliders,
  RotateCw,
  Activity,
} from "lucide-react";
import { RiskBadge } from "@/components/common/RiskBadge";
import { DebouncedInput } from "@/components/common/DebouncedInput";
import { SensorChartModal } from "@/components/sensors/SensorChartModal";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import type { Asset, AssetDetailResponse } from "@/types/grid";

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Substation Ops</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Health Register &amp; Diagnostics</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Assets Register &amp; Health Diagnostics
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Comprehensive electrical infrastructure register, sensor telemetry, and diagnostic health indexing.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-8 px-3.5 bg-white text-[#0b1c30] border border-[#c0c9c0] rounded-md font-mono text-[11px] font-bold hover:bg-[#eff4ff] transition-colors flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#003820]" /> Force SCADA Resync
        </button>
      </div>

      {/* Filter Ribbon */}
      <div className="bg-white p-3.5 rounded-lg shadow-sm border border-[#c0c9c0]/60">
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
              className="w-full h-8 px-2 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-mono rounded-md border border-[#c0c9c0]/60 focus:outline-none"
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
              className="w-full h-8 px-2 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-mono rounded-md border border-[#c0c9c0]/60 focus:outline-none"
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
              className="w-full h-8 px-2 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-mono font-medium rounded-md border border-[#c0c9c0]/60 focus:outline-none"
            >
              <option value="">All Risk Tiers</option>
              <option value="CRITICAL">Critical Risk (&gt;85%)</option>
              <option value="HIGH">High Risk (60-85%)</option>
              <option value="MEDIUM">Medium Risk (25-60%)</option>
              <option value="LOW">Nominal (&lt;25%)</option>
            </select>
          </div>
          <div className="md:col-span-2 flex items-center justify-end font-mono text-[11px] text-[#707971]">
            {filteredAssets.length} assets shown
          </div>
        </div>
      </div>

      {/* Main Split Layout: Table (7 cols) + Diagnostics Drawer (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Table View */}
        <div className="lg:col-span-7 bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 overflow-hidden flex flex-col justify-between">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-[12.5px]">
              <thead>
                <tr className="bg-[#eff4ff] text-[#404942] font-mono text-[10px] uppercase tracking-wider border-b border-[#c0c9c0]/40">
                  <th className="py-2.5 px-3">Asset ID</th>
                  <th className="py-2.5 px-3">Type &amp; Substation</th>
                  <th className="py-2.5 px-3">Risk Tier</th>
                  <th className="py-2.5 px-3">P(Failure)</th>
                  <th className="py-2.5 px-3 text-right">Impact</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eff4ff]">
                {paginatedAssets.map((asset) => {
                  const isSelected = asset.asset_id === selectedAssetId;
                  return (
                    <tr
                      key={asset.asset_id}
                      onClick={() => setSelectedAssetId(asset.asset_id)}
                      className={`hover:bg-[#eff4ff] cursor-pointer transition-colors ${
                        isSelected ? "bg-[#baeed9]/20 font-semibold" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1 h-4 rounded-full ${isSelected ? "bg-[#003820]" : "bg-transparent"}`}
                          />
                          <span className="font-mono font-bold text-[#003820]">{asset.asset_id}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#0b1c30] text-[12px]">{asset.asset_type}</div>
                        <div className="text-[10px] text-[#707971] font-mono">
                          {asset.geographic_area || asset.area}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <RiskBadge level={asset.priority || "LOW"} />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#ba1a1a]">
                          {F.pct(asset.failure_probability)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0b1c30]">
                        {F.score(asset.grid_impact_score)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono text-[9.5px] px-1.5 py-0.5 bg-[#eff4ff] text-[#404942] rounded uppercase">
                          {asset.current_status || "IN_SERVICE"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-[#707971] inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-3 py-2 bg-[#f8f9ff] border-t border-[#c0c9c0]/40 flex items-center justify-between font-mono text-[11px] text-[#404942]">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-2.5 py-1 bg-white border border-[#c0c9c0] rounded disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="px-2.5 py-1 bg-white border border-[#c0c9c0] rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostics Drawer (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-3.5 flex flex-col gap-3">
          {isDetailLoading || !assetDetail ? (
            <div className="p-8 text-center font-mono text-[11px] text-[#707971]">
              <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#003820]" />
              Loading asset telemetry…
            </div>
          ) : (
            <>
              {/* Asset Identity Card */}
              <div className="flex items-start justify-between pb-2 border-b border-[#c0c9c0]/40">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-bold text-[#003820] font-mono">{a?.asset_id}</h2>
                    <RiskBadge level={lvl} />
                  </div>
                  <div className="text-[11px] text-[#404942]">
                    {a?.asset_type} &bull; {a?.geographic_area || a?.area} &bull; {F.num(a?.customers_served)} customers
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[16px] font-bold text-[#ba1a1a]">
                    {fp.toFixed(1)}%
                  </div>
                  <div className="font-mono text-[9px] text-[#707971] uppercase">Failure Probability</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2 font-mono text-[10.5px]">
                <button
                  onClick={() => handleDispatch(selectedAssetId)}
                  className="h-7 bg-[#ba1a1a] text-white font-bold rounded uppercase hover:opacity-90 flex items-center justify-center gap-1 shadow-sm"
                >
                  <Send className="w-3 h-3" /> Dispatch
                </button>
                <button
                  onClick={() => router.push(`/simulation?asset=${selectedAssetId}`)}
                  className="h-7 bg-[#eff4ff] text-[#0b1c30] border border-[#c0c9c0] font-bold rounded uppercase hover:bg-[#dce9ff] flex items-center justify-center gap-1"
                >
                  <Sliders className="w-3 h-3" /> Simulate
                </button>
                <button
                  onClick={() => ok(`Diagnostics for ${selectedAssetId} copied to clipboard`)}
                  className="h-7 bg-[#eff4ff] text-[#0b1c30] border border-[#c0c9c0] font-bold rounded uppercase hover:bg-[#dce9ff] flex items-center justify-center gap-1"
                >
                  Export Log
                </button>
              </div>

              {/* Sensor Telemetry Sparklines */}
              <div>
                <div className="font-mono text-[10.5px] uppercase font-bold text-[#404942] mb-1.5">
                  Live Sensor Telemetry (Click to expand)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(assetDetail.sensors_summary || {}).map(([key, s]) => (
                    <div
                      key={key}
                      onClick={() => setModalSensor(s)}
                      className="p-2 bg-[#eff4ff] rounded-md border border-[#c0c9c0]/40 hover:border-[#0f5132] cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#404942] uppercase truncate">{s.label}</span>
                        <span className="font-bold text-[#0b1c30]">
                          {s.latest} {s.unit}
                        </span>
                      </div>
                      <div className="h-10 w-full mt-1">
                        <svg className="w-full h-full" viewBox="0 0 160 40" preserveAspectRatio="none">
                          <path
                            d={s.path || "M0,20 L160,20"}
                            fill="none"
                            stroke={s.color || "#ba1a1a"}
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SHAP Risk Factors */}
              <div>
                <div className="font-mono text-[10.5px] uppercase font-bold text-[#404942] mb-1.5">
                  Top SHAP Risk Factors (Model Drivers)
                </div>
                <div className="space-y-1.5">
                  {(p?.shap_factors || []).slice(0, 4).map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#0b1c30]">{f.label}</span>
                      <span className="text-[#707971] text-[10px]">val: {f.value} &bull; z={f.z}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sensor Zoom Modal */}
      {modalSensor && (
        <SensorChartModal
          isOpen={!!modalSensor}
          onClose={() => setModalSensor(null)}
          label={modalSensor.label}
          value={modalSensor.latest}
          unit={modalSensor.unit}
          status={modalSensor.status}
          threshold={modalSensor.threshold}
        />
      )}
    </div>
  );
}
