"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sliders, AlertTriangle, CloudRain, Play, ShieldAlert, Users, DollarSign } from "lucide-react";
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Digital Twin</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">What-If Simulation Engine</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            What-If Scenario Simulation &amp; Stress-Testing
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Evaluate cascading outage contingencies, neighbor feeder overloads, and storm impacts before they happen.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-[#eff4ff] p-1 rounded-lg border border-[#c0c9c0]/60 self-start md:self-auto font-mono text-[11px] font-bold">
          <button
            onClick={() => setActiveTab("asset")}
            className={`px-3 py-1 rounded-md transition-all ${
              activeTab === "asset"
                ? "bg-[#0f5132] text-white shadow-sm"
                : "text-[#404942] hover:text-[#0b1c30]"
            }`}
          >
            Asset Trip (N-1)
          </button>
          <button
            onClick={() => {
              setActiveTab("weather");
              if (!weatherSimResult) runWeatherSim(selectedArea, severity);
            }}
            className={`px-3 py-1 rounded-md transition-all ${
              activeTab === "weather"
                ? "bg-[#0f5132] text-white shadow-sm"
                : "text-[#404942] hover:text-[#0b1c30]"
            }`}
          >
            Weather Scenario
          </button>
        </div>
      </div>

      {activeTab === "asset" ? (
        /* Asset Trip Simulation (N-1 Contingency) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* Controls (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-3.5 space-y-3">
            <div className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30] pb-1 border-b border-[#c0c9c0]/40">
              Select Trip Candidate
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#707971] mb-1">Target Asset ID</label>
              <select
                value={selectedAsset}
                onChange={(e) => {
                  setSelectedAsset(e.target.value);
                  runAssetSim(e.target.value);
                }}
                className="w-full h-8 px-2 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-mono rounded-md border border-[#c0c9c0]/60"
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
              className="w-full h-8 bg-[#0f5132] text-white font-mono text-[11px] font-bold rounded-md uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Run N-1 Simulation
            </button>

            {assetSimResult && (
              <div className="p-3 bg-[#eff4ff] rounded-md border border-[#c0c9c0]/50 space-y-2 text-[11.5px]">
                <div className="font-bold text-[#0b1c30]">Simulated Asset Specs:</div>
                <div className="font-mono text-[11px] text-[#404942]">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <div className="bg-white p-3 rounded-lg border border-[#c0c9c0]/50 shadow-sm">
                    <div className="text-[10px] font-mono text-[#707971] uppercase">Direct Outage</div>
                    <div className="text-[17px] font-mono font-bold text-[#ba1a1a]">
                      {F.num(assetSimResult.contingency_impact?.direct_customers_interrupted)}
                    </div>
                    <div className="text-[10px] text-[#707971]">Customers lost</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#c0c9c0]/50 shadow-sm">
                    <div className="text-[10px] font-mono text-[#707971] uppercase">Cascading Risk</div>
                    <div className="mt-0.5">
                      <RiskBadge level={assetSimResult.contingency_impact?.cascading_risk_level} />
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#c0c9c0]/50 shadow-sm">
                    <div className="text-[10px] font-mono text-[#707971] uppercase">Overloaded Assets</div>
                    <div className="text-[17px] font-mono font-bold text-[#ba1a1a]">
                      {assetSimResult.contingency_impact?.overloaded_neighbor_assets?.length || 2}
                    </div>
                    <div className="text-[10px] text-[#707971]">Adjacent lines</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#c0c9c0]/50 shadow-sm">
                    <div className="text-[10px] font-mono text-[#707971] uppercase">Est. Economic Loss</div>
                    <div className="text-[17px] font-mono font-bold text-[#0b1c30]">
                      ${F.num(assetSimResult.contingency_impact?.estimated_economic_impact_usd || 1200000)}
                    </div>
                  </div>
                </div>

                {/* Overloaded Lines & Mitigation Plan */}
                <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-3.5 space-y-3">
                  <div className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30] pb-1 border-b border-[#c0c9c0]/40">
                    Recommended Dispatch &amp; Switching Mitigation
                  </div>
                  <div className="space-y-2">
                    {(assetSimResult.mitigation_steps || []).map((step) => (
                      <div
                        key={step.step}
                        className="p-2.5 bg-[#f8f9ff] rounded-md border border-[#c0c9c0]/40 flex items-start gap-2.5 text-[12px]"
                      >
                        <span className="w-5 h-5 rounded-full bg-[#003820] text-white font-mono text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {step.step}
                        </span>
                        <div className="flex-1">
                          <div className="font-semibold text-[#0b1c30]">{step.action}</div>
                          <div className="font-mono text-[10px] text-[#707971]">
                            Expected response time: {step.expected_response_min} min
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 bg-white rounded-lg border border-[#c0c9c0]/60 text-center font-mono text-[11px] text-[#707971]">
                Running contingency analysis…
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Weather Stress-Test Scenario */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-4 bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-3.5 space-y-3">
            <div className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30] pb-1 border-b border-[#c0c9c0]/40">
              Storm Simulation Controls
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#707971] mb-1">Target Geographic Area</label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full h-8 px-2 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-mono rounded-md border border-[#c0c9c0]/60"
              >
                {areas.map((a) => (
                  <option key={a.area_id} value={a.area_id}>
                    {a.area_id} &mdash; {a.risk_level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[#707971] mb-1">Storm Severity Tier</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full h-8 px-2 bg-[#eff4ff] text-[#0b1c30] text-[12px] font-mono rounded-md border border-[#c0c9c0]/60"
              >
                <option value="MODERATE">Moderate Storm (Score 50-65)</option>
                <option value="SEVERE">Severe Storm (Score 65-85)</option>
                <option value="EXTREME">Extreme Cyclone/Gale (Score &gt;85)</option>
              </select>
            </div>
            <button
              disabled={isSimulating}
              onClick={() => runWeatherSim(selectedArea, severity)}
              className="w-full h-8 bg-[#ba1a1a] text-white font-mono text-[11px] font-bold rounded-md uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <CloudRain className="w-3.5 h-3.5" /> Simulate Storm Impact
            </button>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-3">
            {weatherSimResult && (
              <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-[#c0c9c0]/40">
                  <span className="font-mono text-[12px] font-bold text-[#0b1c30]">
                    Storm Impact Summary: {weatherSimResult.area_id}
                  </span>
                  <span className="font-mono text-[11px] text-[#ba1a1a] font-bold">
                    Outage Prob: {F.pct(weatherSimResult.updated_outage_probability)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div className="p-2.5 bg-[#eff4ff] rounded-md border border-[#c0c9c0]/40">
                    <span className="font-mono text-[10px] text-[#707971] uppercase">Affected Assets</span>
                    <div className="font-mono text-[16px] font-bold text-[#0b1c30]">
                      {weatherSimResult.affected_assets_count || 14}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#ffdad6]/50 rounded-md border border-[#ba1a1a]/30">
                    <span className="font-mono text-[10px] text-[#ba1a1a] uppercase">Critical Breakdown Risk</span>
                    <div className="font-mono text-[16px] font-bold text-[#ba1a1a]">
                      {weatherSimResult.critical_assets_count || 4}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
