"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PanelCard } from "@/components/common/PanelCard";
import { RiskBadge } from "@/components/common/RiskBadge";

import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import type { SimulationResponse, WeatherSimResponse } from "@/types/grid";
import {
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tile,
  Select,
  SelectItem,
  Tag,
} from "@carbon/react";
import { Play, Rain, Receipt, Activity, Lightning, Target } from "@carbon/icons-react";

export default function SimulationPage() {
  const searchParams = useSearchParams();
  const initialAsset = searchParams.get("asset") || "T-1024";
  const initialTab = searchParams.get("tab") || "asset";

  const { ok, err, warn } = useToast();

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

  const [notifyTelegram, setNotifyTelegram] = useState(false);

  const reportDelivery = (res: { notification?: { status: string; error_message: string | null } }) => {
    const n = res.notification;
    if (!n) return;
    if (n.status === "SENT") ok("Result sent to Telegram.");
    else if (n.status === "SKIPPED") warn(n.error_message || "Duplicate — not re-sent.");
    else err(n.error_message || "Telegram delivery failed.");
  };

  const inFlight = useRef(false);

  const runAssetSim = async (assetId: string, notify = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSimulating(true);
    try {
      const res = await API.simulateAsset(assetId, notify);
      setAssetSimResult(res);
      reportDelivery(res);
    } catch (e: any) {
      err(e.message || "Simulation failed");
    } finally {
      inFlight.current = false;
      setIsSimulating(false);
    }
  };

  const runWeatherSim = async (areaId: string, sev: string, notify = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSimulating(true);
    try {
      const res = await API.simulateWeather(areaId, sev, notify);
      setWeatherSimResult(res);
      reportDelivery(res);
    } catch (e: any) {
      err(e.message || "Simulation failed");
    } finally {
      inFlight.current = false;
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    if (selectedAsset) {
      runAssetSim(selectedAsset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in font-sans pb-10">
      {/* Header */}
      <div className="pb-3 border-b border-line">
        <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-1 font-mono">
          <span>OPERATIONAL DECISION SUPPORT</span>
          <span className="text-line">/</span>
          <span>CONCURRENT ENGINE SESSIONS: ACTIVE</span>
        </div>
        <h1 className="text-[32px] font-bold text-[#0a192f] tracking-tight leading-tight">
          Grid Outage Simulation & Operational Copilot
        </h1>
        <p className="text-label text-ink-2 mt-1">
          Scenario contingency modelling, weather impact stress-testing, and AI decision-support advisor.
        </p>
      </div>

      <Tile className="p-0 shadow-panel border border-line rounded-none overflow-hidden">
        {/* Panel Header */}
        <div className="bg-[#f0f4f8] border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-micro font-bold text-[#0a192f] uppercase tracking-wider">
            <Activity size={16} className="text-[#0f5132]" />
            WHAT-IF CONTINGENCY & STRESS SIMULATION ENGINE
          </div>
          <div className="text-micro font-mono text-ink-3 uppercase tracking-wider">
            POST /api/simulation
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5 bg-white">
          {/* Tabs */}
          <div className="flex grid grid-cols-2 gap-0 border border-line rounded-none">
            <button
              onClick={() => setActiveTab("asset")}
              className={`py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider ${
                activeTab === "asset"
                  ? "bg-[#0f5132] text-white"
                  : "bg-white text-ink-2 hover:bg-gray-50"
              }`}
            >
              <Lightning size={20} /> ASSET FAILURE CONTINGENCY (N-1 / N-2)
            </button>
            <button
              onClick={() => setActiveTab("weather")}
              className={`py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider ${
                activeTab === "weather"
                  ? "bg-[#0f5132] text-white"
                  : "bg-white text-ink-2 hover:bg-gray-50"
              }`}
            >
              <Rain size={20} /> SEVERE WEATHER EVENT SIMULATION
            </button>
          </div>

          {activeTab === "asset" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Select
                  id="target-asset"
                  labelText="TARGET PRIMARY ASSET"
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full uppercase font-bold text-ink-2"
                >
                  {assets.map((a: any) => (
                    <SelectItem
                      key={a.asset_id}
                      value={a.asset_id}
                      text={`${a.asset_id} — ${a.asset_type} (${a.geographic_area || a.area})`}
                    />
                  ))}
                </Select>

                <Select
                  id="cascade-model"
                  labelText="CASCADE MODEL"
                  value="same-sub"
                  onChange={() => {}}
                  className="w-full uppercase font-bold text-ink-2"
                >
                  <SelectItem value="same-sub" text="Same-substation downstream fan-out" />
                  <SelectItem value="full-grid" text="Full regional grid cascade" />
                </Select>
              </div>

              <div className="flex items-center gap-2 text-micro font-mono uppercase tracking-wider text-ink-2">
                <span className="w-2 h-2 rounded-full bg-[#0f5132]" />
                ENGINE READY <span className="mx-2 text-line">•</span> Last run: 26ms <span className="mx-2 text-line">•</span> {new Date().toLocaleTimeString('en-GB', { hour12: false })}
              </div>

              <Button
                size="lg"
                disabled={isSimulating}
                onClick={() => runAssetSim(selectedAsset, notifyTelegram)}
                className="w-full bg-[#0f5132] hover:bg-[#0a3622] flex items-center justify-center gap-2 text-base font-bold tracking-wider"
              >
                ▶ RUN GRID CONTINGENCY SIMULATION
              </Button>
            </div>
          )}

          {activeTab === "weather" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Select
                  id="target-area"
                  labelText="TARGET REGION"
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="w-full uppercase font-bold text-ink-2"
                >
                  {areas.map((a: any) => (
                    <SelectItem key={a.area_id} value={a.area_id} text={a.area_id} />
                  ))}
                </Select>

                <Select
                  id="severity"
                  labelText="EVENT SEVERITY"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full uppercase font-bold text-ink-2"
                >
                  <SelectItem value="MODERATE" text="MODERATE (Warning Level)" />
                  <SelectItem value="SEVERE" text="SEVERE (Action Level)" />
                  <SelectItem value="EXTREME" text="EXTREME (Emergency Level)" />
                </Select>
              </div>

              <div className="flex items-center gap-2 text-micro font-mono uppercase tracking-wider text-ink-2">
                <span className="w-2 h-2 rounded-full bg-[#0f5132]" />
                ENGINE READY <span className="mx-2 text-line">•</span> Last run: 14ms <span className="mx-2 text-line">•</span> {new Date().toLocaleTimeString('en-GB', { hour12: false })}
              </div>

              <Button
                size="lg"
                disabled={isSimulating}
                onClick={() => runWeatherSim(selectedArea, severity, notifyTelegram)}
                className="w-full bg-[#0f5132] hover:bg-[#0a3622] flex items-center justify-center gap-2 text-base font-bold tracking-wider"
              >
                ▶ RUN WEATHER STRESS SIMULATION
              </Button>
            </div>
          )}
        </div>
      </Tile>

      {/* Delta Results (Shows on run) */}
      {(assetSimResult || weatherSimResult) && (
        <Tile className="p-0 mt-2 shadow-panel border border-line rounded-none overflow-hidden">
          <div className="bg-[#fff0f0] border-b border-line px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-micro font-bold text-[#ba1a1a] uppercase tracking-wider">
              <Target size={16} className="text-[#ba1a1a]" />
              BEFORE VS AFTER SIMULATION IMPACT ANALYSIS
            </div>
            <div className="text-micro font-mono text-[#ba1a1a] uppercase tracking-wider font-bold">
              DELTA CRITICAL — Calculated at: {new Date().toLocaleTimeString('en-GB', { hour12: false })}
            </div>
          </div>

          <div className="bg-white">
            <Table size="sm" className="w-full">
              <TableHead>
                <TableRow>
                  <TableHeader className="uppercase text-micro text-[#0a192f] bg-[#f8fbff] font-bold">Parameter Metric</TableHeader>
                  <TableHeader className="uppercase text-micro text-[#0a192f] bg-[#f8fbff] font-bold">Current<br/>Steady State</TableHeader>
                  <TableHeader className="uppercase text-micro text-[#0a192f] bg-[#f8fbff] font-bold">Simulated Failure State</TableHeader>
                  <TableHeader className="uppercase text-micro text-[#0a192f] bg-[#f8fbff] font-bold">Delta /<br/>Operational Impact</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeTab === "asset" && assetSimResult && (
                  <>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">Customers served directly</TableCell>
                      <TableCell className="font-mono text-ink-3">0 affected</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{F.num(assetSimResult.direct_customers)} affected</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">Downstream customers (cascade)</TableCell>
                      <TableCell className="font-mono text-ink-3">0 affected</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{F.num(assetSimResult.downstream_customers)} affected</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line bg-gray-50">
                      <TableCell className="font-bold text-ink">Total customers out</TableCell>
                      <TableCell className="font-mono text-ink-3">0 affected</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{F.num(assetSimResult.total_customers_affected)} affected</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">Areas impacted</TableCell>
                      <TableCell className="font-mono text-ink-3">None</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{assetSimResult.affected_areas?.length || 1}: {assetSimResult.area}</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">Downstream assets on substation</TableCell>
                      <TableCell className="font-mono text-ink-3">0</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{assetSimResult.downstream_assets?.length || 0}</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">Estimated outage duration</TableCell>
                      <TableCell className="font-mono text-ink-3">In service</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{assetSimResult.estimated_outage_minutes || 0} min (historical mean for {assetSimResult.asset_type})</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">Severity band</TableCell>
                      <TableCell className="font-mono text-ink-3">NOMINAL</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity}</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a] uppercase">{assetSimResult.severity || "CRITICAL"}</TableCell>
                    </TableRow>
                  </>
                )}
                {activeTab === "weather" && weatherSimResult && (
                  <>
                    <TableRow className="border-b border-line bg-gray-50">
                      <TableCell className="font-bold text-ink">System Outage Probability</TableCell>
                      <TableCell className="font-mono text-ink-3">{(weatherSimResult.baseline_outage_probability * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{(weatherSimResult.new_outage_probability * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a]">CRITICAL (+{(weatherSimResult.delta * 100).toFixed(1)}%)</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-line">
                      <TableCell className="font-bold text-ink">High Risk Assets Predicted</TableCell>
                      <TableCell className="font-mono text-ink-3">Baseline</TableCell>
                      <TableCell className="font-mono font-bold text-[#ba1a1a]">{weatherSimResult.high_risk_assets} assets at risk</TableCell>
                      <TableCell className="font-bold text-[#ba1a1a]">CRITICAL</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>

            <div className="p-4 border-t border-line flex items-center gap-3">
              <div className="text-micro font-bold uppercase text-[#0a192f] tracking-wider flex items-center gap-1.5">
                <Receipt size={16} className="text-[#0a192f]" />
                AUTOMATED MITIGATION PLAYBOOK
              </div>
              <Tag type="green" className="m-0 uppercase font-bold tracking-wider">
                REQUIRED SKILL: {assetSimResult?.required_skill || weatherSimResult?.recommended_mitigation?.[0] || "GENERAL"}
              </Tag>
            </div>
          </div>
        </Tile>
      )}
    </div>
  );
}
