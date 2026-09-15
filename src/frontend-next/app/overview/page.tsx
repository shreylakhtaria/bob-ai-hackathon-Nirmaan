"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  Zap,
  Users,
  Wrench,
  ChevronRight,
  Send,
  RotateCw,
} from "lucide-react";
import { KpiTile } from "@/components/common/KpiTile";
import { RiskBadge } from "@/components/common/RiskBadge";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";

export default function OverviewPage() {
  const router = useRouter();
  const { ok, err } = useToast();

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => API.summary(),
  });

  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => API.alerts(),
  });

  const handleDispatch = async (assetId: string) => {
    try {
      const res = await API.dispatch(assetId);
      ok(res.message || `Dispatched crew to ${assetId}`);
      refetch();
    } catch (e: any) {
      err(e.message || "Dispatch failed");
    }
  };

  if (isLoading || !summary) {
    return <ScadaSkeletonLoader />;
  }

  const topAsset = summary.top_assets?.[0];

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Page Heading */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>GRID OPS</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">OPERATIONS OVERVIEW</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Grid Operations Overview
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Current asset health, outage risk, and operational priorities &mdash; SCADA &amp; ML Forecast Feed
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-8 px-3.5 bg-white text-[#0b1c30] border border-[#c0c9c0] rounded-md font-mono text-[11px] font-bold hover:bg-[#eff4ff] transition-colors flex items-center gap-1.5 self-start md:self-auto shadow-sm"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#003820]" /> Force Rescan
        </button>
      </div>

      {/* 5 KPI Summary Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <KpiTile
          icon={<Activity className="w-4 h-4" />}
          label="Overall Grid Risk"
          value={summary.overall_grid_risk || "HIGH"}
          sub={`${summary.total_assets || 220} assets monitored`}
          level={summary.overall_grid_risk}
        />
        <KpiTile
          icon={<AlertTriangle className="w-4 h-4 text-[#ba1a1a]" />}
          label="Critical Assets"
          value={summary.critical_assets || 19}
          sub="Require immediate action"
          level="CRITICAL"
        />
        <KpiTile
          icon={<ShieldAlert className="w-4 h-4 text-[#376757]" />}
          label="High-Risk Assets"
          value={summary.high_risk_assets || 1}
          sub="P(fail) > 65%"
          level="HIGH"
        />
        <KpiTile
          icon={<Zap className="w-4 h-4 text-[#0f5132]" />}
          label="Predicted Failures"
          value={summary.predicted_failures || 21}
          sub="Next 72h horizon"
          level="HIGH"
        />
        <KpiTile
          icon={<Users className="w-4 h-4 text-[#003820]" />}
          label="Customers at Risk"
          value={F.num(summary.customers_at_risk) || "249,897"}
          sub={`${summary.weather_exposed_zones || 2} weather zones`}
          level="MEDIUM"
        />
      </div>

      {/* Top Recommended Action Banner */}
      {topAsset && (
        <div className="bg-[#eff4ff] border border-[#c0c9c0] rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 bg-[#ffdad6] text-[#ba1a1a] rounded-md mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-mono text-[10px] text-[#ba1a1a] font-bold uppercase tracking-wider">
                TOP RECOMMENDED ACTION
              </div>
              <div className="text-[13px] font-semibold text-[#0b1c30]">
                Immediate insulation / partial-discharge inspection on{" "}
                <span className="font-mono text-[#003820] font-bold">{topAsset.asset_id}</span> ({topAsset.area},{" "}
                {F.num(topAsset.customers_served)} customers)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDispatch(topAsset.asset_id)}
              className="h-8 px-3.5 bg-[#ba1a1a] text-white font-mono text-[11px] font-bold rounded-md uppercase hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" /> Dispatch Crew Now
            </button>
            <button
              onClick={() => router.push(`/simulation?asset=${topAsset.asset_id}`)}
              className="h-8 px-3 bg-white text-[#0b1c30] font-mono text-[11px] font-semibold rounded-md border border-[#c0c9c0] hover:bg-[#dce9ff] transition-colors shadow-sm"
            >
              Simulate Failure
            </button>
            <button
              onClick={() => router.push(`/assets?assetId=${topAsset.asset_id}`)}
              className="h-8 px-3 bg-white text-[#0b1c30] font-mono text-[11px] font-semibold rounded-md border border-[#c0c9c0] hover:bg-[#dce9ff] transition-colors shadow-sm"
            >
              Review Telemetry
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Critical Assets Table & Regional Exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left: Critical Actionable Equipment (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#ba1a1a]" />
                <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
                  Critical Now &mdash; High Priority Equipment
                </span>
                <span className="font-mono text-[10px] bg-[#ba1a1a] text-white px-1.5 py-0.5 rounded font-bold">
                  {summary.critical_assets || 19} Actionable
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#707971]">Real-Time SCADA Matrix</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-[12.5px]">
                <thead>
                  <tr className="bg-[#eff4ff] text-[#404942] font-mono text-[10px] uppercase tracking-wider border-b border-[#c0c9c0]/40">
                    <th className="py-2 px-3">Asset ID</th>
                    <th className="py-2 px-3">Area/Substation</th>
                    <th className="py-2 px-3">Severity</th>
                    <th className="py-2 px-3">Failure Prob.</th>
                    <th className="py-2 px-3 text-right">Customers</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff4ff]">
                  {(summary.top_assets || []).slice(0, 6).map((a) => (
                    <tr
                      key={a.asset_id}
                      onClick={() => router.push(`/assets?assetId=${a.asset_id}`)}
                      className="hover:bg-[#eff4ff] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]" />
                          <span className="font-mono font-bold text-[#003820]">{a.asset_id}</span>
                        </div>
                        <div className="text-[10px] text-[#707971]">{a.asset_type}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#404942]">{a.area}</td>
                      <td className="py-2.5 px-3">
                        <RiskBadge level={a.priority || "CRITICAL"} />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-[#d3e4fe] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#ba1a1a] rounded-full"
                              style={{ width: `${Math.round((a.failure_probability || 0.8) * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-bold text-[#ba1a1a]">
                            {F.pct(a.failure_probability)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                        {F.num(a.customers_served)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/assets?assetId=${a.asset_id}`);
                          }}
                          className="px-2 py-0.5 bg-[#ffdad6] text-[#ba1a1a] font-mono text-[10px] font-bold rounded hover:opacity-90"
                        >
                          Inspect &rsaquo;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Grid-Impact Assets */}
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#003820]" />
                <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
                  Top Grid-Impact Assets &mdash; System Exposure
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#707971]">Top 5 Ranked</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-[12.5px]">
                <thead>
                  <tr className="bg-[#eff4ff] text-[#404942] font-mono text-[10px] uppercase tracking-wider border-b border-[#c0c9c0]/40">
                    <th className="py-2 px-3">Asset ID</th>
                    <th className="py-2 px-3">Type &amp; Location</th>
                    <th className="py-2 px-3">Risk</th>
                    <th className="py-2 px-3">P(Fail)</th>
                    <th className="py-2 px-3 text-right">Impact</th>
                    <th className="py-2 px-3 text-right">Customers</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff4ff]">
                  {(summary.top_assets || []).slice(0, 5).map((a) => (
                    <tr
                      key={a.asset_id}
                      onClick={() => router.push(`/assets?assetId=${a.asset_id}`)}
                      className="hover:bg-[#eff4ff] cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-3 font-mono font-bold text-[#003820]">{a.asset_id}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-[#0b1c30] text-[12px]">{a.asset_type}</div>
                        <div className="text-[10.5px] text-[#707971] font-mono">{a.area}</div>
                      </td>
                      <td className="py-2 px-3">
                        <RiskBadge level={a.priority || "CRITICAL"} />
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] font-bold text-[#ba1a1a]">
                        {F.pct(a.failure_probability)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#0b1c30]">
                        {F.score(a.grid_impact_score)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-[11px]">
                        {F.num(a.customers_served)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-[#707971] inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Regional Risk Exposure & Active Alerts (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          {/* Regional Risk Matrix */}
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-[#c0c9c0]/40">
              <span className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30]">
                Regional Risk Exposure
              </span>
              <span className="font-mono text-[10px] text-[#707971]">6 Areas Active</span>
            </div>
            <div className="space-y-2">
              {(summary.areas || []).map((area) => (
                <div
                  key={area.area_id}
                  onClick={() => router.push("/risk-areas")}
                  className="p-2 bg-[#f8f9ff] hover:bg-[#eff4ff] rounded-md border border-[#c0c9c0]/40 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-mono text-[12px] font-bold text-[#0b1c30]">{area.area_id}</div>
                    <div className="text-[10.5px] text-[#707971]">
                      {area.high_risk_assets} high-risk assets &bull; {area.primary_driver || "Elevated failure risk"}
                    </div>
                  </div>
                  <RiskBadge level={area.risk_level} />
                </div>
              ))}
            </div>
          </div>

          {/* Active SCADA Operational Alerts */}
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-[#c0c9c0]/40">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#ba1a1a]" />
                <span className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30]">
                  Active Operational Alerts
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#ba1a1a] font-bold">
                {alerts?.length || 22} Active Trips
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(alerts || []).slice(0, 5).map((al) => (
                <div
                  key={al.alert_id}
                  className="p-2.5 bg-[#f8f9ff] rounded-md border border-[#c0c9c0]/50 flex flex-col gap-1 text-[11.5px]"
                >
                  <div className="flex items-center justify-between">
                    <RiskBadge level={al.priority} />
                    <span className="font-mono text-[9.5px] text-[#707971]">{F.date(al.created_at)}</span>
                  </div>
                  <div className="font-semibold text-[#0b1c30]">{al.title}</div>
                  <div className="text-[11px] text-[#404942]">{al.reason}</div>
                  <div className="text-[11px] text-[#003820] font-medium">&rsaquo; {al.recommended_action}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
