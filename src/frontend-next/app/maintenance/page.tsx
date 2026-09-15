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

  if (isLoading) {
    return <ScadaSkeletonLoader />;
  }

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Work Orders</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Maintenance Priorities</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Impact-Ranked Maintenance Queue
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Dynamic outage mitigation schedule reordered by real-world consequence &bull; Priority #1:{" "}
            <strong>T-1024</strong> (48,200 customers)
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-8 px-3.5 bg-white text-[#0b1c30] border border-[#c0c9c0] rounded-md font-mono text-[11px] font-bold hover:bg-[#eff4ff] transition-colors flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#003820]" /> Refresh Queue
        </button>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 overflow-hidden">
        <div className="px-3.5 py-2.5 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#003820]" />
            <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
              Ranked Outage Candidates ({queue.length} Total)
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#707971]">Sorted by Grid Impact Score (Desc)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-[12.5px]">
            <thead>
              <tr className="bg-[#eff4ff] text-[#404942] font-mono text-[10px] uppercase tracking-wider border-b border-[#c0c9c0]/40">
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
            <tbody className="divide-y divide-[#eff4ff]">
              {queue.map((item, idx) => (
                <tr
                  key={item.asset_id}
                  onClick={() => router.push(`/assets?assetId=${item.asset_id}`)}
                  className={`hover:bg-[#eff4ff] cursor-pointer transition-colors ${
                    idx === 0 ? "bg-[#baeed9]/20 font-semibold" : ""
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold ${
                        item.priority === "CRITICAL"
                          ? "bg-[#ffdad6] text-[#ba1a1a]"
                          : "bg-[#d3e4fe] text-[#0b1c30]"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#003820]">
                    {item.asset_id}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-[#0b1c30] text-[12px]">{item.asset_type}</div>
                    <div className="text-[10px] text-[#707971] font-mono">
                      {item.geographic_area || item.area}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#ba1a1a]">
                    {F.pct(item.failure_probability)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                    {F.num(item.customers_served)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0b1c30]">
                    {F.score(item.grid_impact_score)}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[#404942] max-w-xs truncate">
                    {item.recommended_action || "Immediate diagnostic inspection"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDispatch(item.asset_id)}
                        className="px-2 py-1 bg-[#ba1a1a] text-white font-mono text-[10px] font-bold rounded uppercase hover:opacity-90 transition-opacity"
                      >
                        Dispatch
                      </button>
                      <button
                        onClick={() => handleDefer(item.asset_id)}
                        className="px-2 py-1 bg-[#eff4ff] text-[#0b1c30] font-mono text-[10px] font-bold rounded uppercase hover:bg-[#dce9ff] transition-colors border border-[#c0c9c0]/60"
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
