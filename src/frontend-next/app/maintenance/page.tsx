"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Send, Clock, ChevronRight, AlertTriangle, RotateCw } from "lucide-react";
import { RiskBadge } from "@/components/common/RiskBadge";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";

export default function MaintenancePage() {
  const router = useRouter();
  const { ok, warn, err } = useToast();

  const { data: queue = [], isLoading, refetch } = useQuery({
    queryKey: ["maintenance-queue"],
    queryFn: () => API.maintenance("?limit=50"),
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

  const handleDefer = async (assetId: string) => {
    try {
      const res = await API.defer(assetId, "Deferred from maintenance queue");
      warn(res.message || `Work order for ${assetId} deferred`);
      refetch();
    } catch (e: any) {
      err(e.message || "Defer failed");
    }
  };

  const handleSchedule = async (assetId: string) => {
    try {
      const res = await API.schedule(assetId);
      ok(res.message || `Scheduled job for ${assetId}`);
      refetch();
    } catch (e: any) {
      err(e.message || "Schedule failed");
    }
  };

  if (isLoading) {
    return <ScadaSkeletonLoader />;
  }

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Work Orders</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Maintenance Priorities</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Impact-Ranked Maintenance Queue
          </h1>
          <p className="text-label text-ink-2">
            Dynamic outage mitigation schedule reordered by real-world consequence &bull; Priority #1:{" "}
            <strong>T-1024</strong> (48,200 customers)
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="min-h-9 px-3.5 bg-panel text-ink border border-line rounded-lg font-mono text-micro font-bold hover:bg-sunken transition-colors flex items-center gap-1.5 shadow-panel self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-brand-ink" /> Refresh Queue
        </button>
      </div>

      {/* Queue Table */}
      <div className="bg-panel rounded-xl shadow-panel border border-line overflow-hidden">
        <div className="px-3.5 py-2.5 bg-header flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-brand-ink" />
            <span className="text-micro font-semibold text-ink uppercase">
              Ranked Outage Candidates ({queue.length} Total)
            </span>
          </div>
          <span className="font-mono text-micro text-ink-3">Sorted by Grid Impact Score (Desc)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-label">
            <thead>
              <tr className="bg-sunken text-ink-2 text-micro uppercase tracking-wider border-b border-line">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Asset ID</th>
                <th className="py-2.5 px-3">Type &amp; Area</th>
                <th className="py-2.5 px-3">Failure Prob.</th>
                <th className="py-2.5 px-3 text-right">Customers</th>
                <th className="py-2.5 px-3 text-right">Grid Impact</th>
                <th className="py-2.5 px-3">Recommended Action</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sunken">
              {queue.map((item, idx) => (
                <tr
                  key={item.asset_id}
                  onClick={() => router.push(`/assets?assetId=${item.asset_id}`)}
                  className={`hover:bg-sunken cursor-pointer transition-colors ${
                    idx === 0 ? "bg-sev-normal-tint/20 font-semibold" : ""
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-5 rounded text-micro font-bold ${
                        item.priority === "CRITICAL"
                          ? "bg-sev-critical-tint text-sev-critical"
                          : "bg-sunken text-ink"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-brand-ink">
                    {item.asset_id}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-ink text-label">{item.asset_type}</div>
                    <div className="text-micro text-ink-3 font-mono">
                      {item.geographic_area || item.area}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-sev-critical">
                    {F.pct(item.failure_probability)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-micro">
                    {F.num(item.customers_served)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                    {F.score(item.grid_impact_score)}
                  </td>
                  <td className="py-2.5 px-3 text-micro text-ink-2 max-w-xs truncate">
                    {item.recommended_action || "Immediate diagnostic inspection"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDispatch(item.asset_id)}
                        className="px-2 py-1 bg-sev-critical text-white text-micro font-semibold rounded uppercase hover:opacity-90 transition-opacity"
                      >
                        Dispatch
                      </button>
                      <button
                        onClick={() => handleSchedule(item.asset_id)}
                        className="px-2 py-1 bg-brand text-white text-micro font-semibold rounded uppercase hover:opacity-90 transition-opacity"
                      >
                        Schedule
                      </button>
                      <button
                        onClick={() => handleDefer(item.asset_id)}
                        className="px-2 py-1 bg-sunken text-ink text-micro font-semibold rounded uppercase hover:bg-header transition-colors border border-line"
                      >
                        Defer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
