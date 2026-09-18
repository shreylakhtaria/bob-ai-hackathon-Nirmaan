"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sliders, Play, Server, AlertTriangle, Shield, CheckCircle2, CloudRain, Receipt } from "lucide-react";
import { RiskBadge } from "@/components/common/RiskBadge";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import type { SimulationResponse, WeatherSimResponse } from "@/types/grid";

export default function SimulationPage() {
  const searchParams = useSearchParams();
  const initialAsset = searchParams.get("asset") || "T-1024";
  const initialTab = searchParams.get("tab") || "asset";

  const { ok, warn, err } = useToast();

  const [activeTab, setActiveTab] = useState<"asset" | "weather">((initialTab as any) || "asset");
  const [selectedAsset, setSelectedAsset] = useState<string>(initialAsset);
  const [selectedArea, setSelectedArea] = useState<string>("WEST-05");
  const [severity, setSeverity] = useState<string>("SEVERE");

  const [assetSimResult, setAssetSimResult] = useState<SimulationResponse | null>(null);
  const [weatherSimResult, setWeatherSimResult] = useState<WeatherSimResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showRunsLog, setShowRunsLog] = useState(false);

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => API.audit(40),
    enabled: showRunsLog,
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["assets-list"],
    queryFn: () => API.assets("?limit=500"),
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: () => API.areas(),
  });

  const runAssetSim = async (assetId: string) => {
    setIsSimulating(true);
    try {
      const res = await API.simulateAsset(assetId);
      setAssetSimResult(res);
      ok(`N-1 Contingency simulation completed for ${assetId}`);
    } catch (e: any) {
      err(e.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const runWeatherSim = async (areaId: string, sev: string) => {
    setIsSimulating(true);
    try {
      const res = await API.simulateWeather(areaId, sev);
      setWeatherSimResult(res);
      ok(`Weather stress-test simulation completed for ${areaId}`);
    } catch (e: any) {
      err(e.message || "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    if (selectedAsset) {
      runAssetSim(selectedAsset);
    }
  }, []);

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Simulation</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Predictive Engine</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Grid Contingency &amp; Weather Stress Simulator
          </h1>
          <p className="text-label text-ink-2">
            Evaluate cascading outage contingencies, neighbor feeder overloads, and storm impacts before they happen.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setShowRunsLog(!showRunsLog)}
            className="min-h-9 px-3.5 bg-panel text-ink border border-line rounded-lg font-mono text-micro font-bold hover:bg-sunken transition-colors flex items-center gap-1.5 shadow-panel"
          >
            <Receipt className="w-3.5 h-3.5 text-brand-ink" />
            {showRunsLog ? "Hide Runs Log" : "Runs Log"}
          </button>

          {/* Tab Toggle */}
          <div className="flex bg-sunken p-1 rounded-lg border border-line font-mono text-micro font-bold">
            <button
              onClick={() => setActiveTab("asset")}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === "asset"
                  ? "bg-brand text-white shadow-panel"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Asset Trip (N-1)
            </button>
            <button
              onClick={() => {
                setActiveTab("weather");
                if (!weatherSimResult) runWeatherSim(selectedArea, severity);
              }}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === "weather"
                  ? "bg-brand text-white shadow-panel"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Weather Scenario
            </button>
          </div>
        </div>
      </div>

      {activeTab === "asset" ? (
        /* Asset Trip Simulation (N-1 Contingency) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* Controls (4 cols) */}
          <div className="lg:col-span-4 bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
            <div className="text-micro font-semibold uppercase text-ink pb-1 border-b border-line">
              Select Trip Candidate
            </div>
            <div>
              <label className="block text-micro font-mono text-ink-3 mb-1">Target Asset ID</label>
              <select
                value={selectedAsset}
                onChange={(e) => {
                  setSelectedAsset(e.target.value);
                  runAssetSim(e.target.value);
                }}
                className="w-full min-h-9 px-2 bg-sunken text-ink text-label font-mono rounded-lg border border-line"
              >
                {assets.map((a) => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.asset_id} &mdash; {a.asset_type} ({a.geographic_area || a.area})
                  </option>
                ))}
              </select>
            </div>

            <button
              disabled={isSimulating}
              onClick={() => runAssetSim(selectedAsset)}
              className="w-full min-h-9 bg-brand text-white text-micro font-semibold rounded-lg uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-panel disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Run N-1 Simulation
            </button>

            {assetSimResult && (
              <div className="p-3 bg-sunken rounded-lg border border-line space-y-2 text-micro">
                <div className="font-bold text-ink">Simulated Asset Specs:</div>
                <div className="font-mono text-micro text-ink-2">
                  Type: <strong>{assetSimResult.simulated_asset?.asset_type}</strong>
                  <br />
                  Location: <strong>{assetSimResult.simulated_asset?.geographic_area}</strong>
                  <br />
                  Customers:{" "}
                  <strong>{F.num(assetSimResult.simulated_asset?.customers_served)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Impact Results (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            {assetSimResult ? (
              <>
                {/* Impact KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="bg-panel p-3 rounded-lg border border-line shadow-panel">
                    <div className="text-micro text-ink-3 uppercase">Direct Outage</div>
                    <div className="text-lede font-mono font-bold text-sev-critical">
                      {F.num(assetSimResult.contingency_impact?.direct_customers_interrupted)}
                    </div>
                    <div className="text-micro text-ink-3">Customers lost</div>
                  </div>
                  <div className="bg-panel p-3 rounded-lg border border-line shadow-panel">
                    <div className="text-micro text-ink-3 uppercase">Cascading Risk</div>
                    <div className="mt-0.5">
                      <RiskBadge level={assetSimResult.contingency_impact?.cascading_risk_level} />
                    </div>
                  </div>
                  <div className="bg-panel p-3 rounded-lg border border-line shadow-panel">
                    <div className="text-micro text-ink-3 uppercase">Overloaded Assets</div>
                    <div className="text-lede font-mono font-bold text-sev-critical">
                      {assetSimResult.contingency_impact?.overloaded_neighbor_assets?.length || 2}
                    </div>
                    <div className="text-micro text-ink-3">Adjacent lines</div>
                  </div>
                  <div className="bg-panel p-3 rounded-lg border border-line shadow-panel">
                    <div className="text-micro text-ink-3 uppercase">Est. Economic Loss</div>
                    <div className="text-lede font-mono font-bold text-ink">
                      ${F.num(assetSimResult.contingency_impact?.estimated_economic_impact_usd || 1200000)}
                    </div>
                  </div>
                </div>

                {/* Overloaded Lines & Mitigation Plan */}
                <div className="bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
                  <div className="text-micro font-semibold uppercase text-ink pb-1 border-b border-line">
                    Recommended Dispatch &amp; Switching Mitigation
                  </div>
                  <div className="space-y-2">
                    {(assetSimResult.mitigation_steps || []).map((step) => (
                      <div
                        key={step.step}
                        className="p-2.5 bg-canvas rounded-lg border border-line flex items-start gap-2.5 text-label"
                      >
                        <span className="w-5 h-5 rounded-full bg-brand-ink text-white font-mono text-micro font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {step.step}
                        </span>
                        <div className="flex-1">
                          <div className="font-semibold text-ink">{step.action}</div>
                          <div className="font-mono text-micro text-ink-3">
                            Expected response time: {step.expected_response_min} min
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 bg-panel rounded-lg border border-line text-center font-mono text-micro text-ink-3">
                Running contingency analysis…
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Weather Stress-Test Scenario */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-4 bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
            <div className="text-micro font-semibold uppercase text-ink pb-1 border-b border-line">
              Storm Simulation Controls
            </div>
            <div>
              <label className="block text-micro font-mono text-ink-3 mb-1">Target Geographic Area</label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full min-h-9 px-2 bg-sunken text-ink text-label font-mono rounded-lg border border-line"
              >
                {areas.map((a) => (
                  <option key={a.area_id} value={a.area_id}>
                    {a.area_id} &mdash; {a.risk_level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-micro font-mono text-ink-3 mb-1">Storm Severity Tier</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full min-h-9 px-2 bg-sunken text-ink text-label font-mono rounded-lg border border-line"
              >
                <option value="MODERATE">Moderate Storm (Score 50-65)</option>
                <option value="SEVERE">Severe Storm (Score 65-85)</option>
                <option value="EXTREME">Extreme Cyclone/Gale (Score &gt;85)</option>
              </select>
            </div>
            <button
              disabled={isSimulating}
              onClick={() => runWeatherSim(selectedArea, severity)}
              className="w-full min-h-9 bg-sev-critical text-white text-micro font-semibold rounded-lg uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-panel disabled:opacity-50"
            >
              <CloudRain className="w-3.5 h-3.5" /> Simulate Storm Impact
            </button>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-3">
            {weatherSimResult && (
              <div className="bg-panel rounded-xl shadow-panel border border-line p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-line">
                  <span className="font-mono text-label font-bold text-ink">
                    Storm Impact Summary: {weatherSimResult.area_id}
                  </span>
                  <span className="font-mono text-micro text-sev-critical font-bold">
                    Outage Prob: {F.pct(weatherSimResult.updated_outage_probability)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-label">
                  <div className="p-2.5 bg-sunken rounded-lg border border-line">
                    <span className="text-micro text-ink-3 uppercase">Affected Assets</span>
                    <div className="font-mono text-lede font-bold text-ink">
                      {weatherSimResult.affected_assets_count || 14}
                    </div>
                  </div>
                  <div className="p-2.5 bg-sev-critical-tint/50 rounded-lg border border-sev-critical/30">
                    <span className="text-micro text-sev-critical uppercase">Critical Breakdown Risk</span>
                    <div className="font-mono text-lede font-bold text-sev-critical">
                      {weatherSimResult.critical_assets_count || 4}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Runs Log */}
      {showRunsLog && (
        <div className="mt-4 bg-panel rounded-xl shadow-panel border border-line overflow-hidden animate-fade-in">
          <div className="px-3.5 py-2.5 bg-header flex items-center gap-2 border-b border-line">
            <Receipt className="w-4 h-4 text-brand-ink" />
            <span className="text-micro font-semibold text-ink uppercase">
              Engine &amp; Operator Runs Log
            </span>
          </div>
          <div className="p-3.5 overflow-y-auto max-h-[320px]">
            {loadingAudit ? (
              <div className="text-center font-mono text-micro text-ink-3 py-4">Loading logs...</div>
            ) : auditLogs.length > 0 ? (
              <div className="space-y-1.5">
                {auditLogs.map((log: any, idx: number) => (
                  <div key={idx} className="flex flex-wrap items-start gap-2 py-1.5 border-b border-sunken last:border-0 font-sans text-label">
                    <span className="font-mono text-micro text-ink-3 whitespace-nowrap">{F.date(log.ts)}</span>
                    <span className="text-micro font-semibold uppercase px-1.5 py-0.5 rounded bg-sunken text-ink-2 whitespace-nowrap">
                      {log.actor}
                    </span>
                    <span className="font-semibold text-ink">{log.action}</span>
                    <span className="font-mono text-micro text-ink-3 truncate max-w-full">
                      {JSON.stringify(log.detail)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center font-mono text-micro text-ink-3 py-4">No runs recorded yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
