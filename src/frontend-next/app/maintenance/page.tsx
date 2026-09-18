"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { Renew, Tools } from "@carbon/icons-react";

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
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Renew}
          onClick={() => refetch()}
          className="self-start md:self-auto"
        >
          Refresh queue
        </Button>
      </div>

      {/* Queue Table */}
      <div className="bg-panel rounded-xl shadow-panel border border-line overflow-hidden">
        <div className="px-3.5 py-2.5 bg-header flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-2">
            <Tools size={16} className="fill-current text-brand-ink" />
            <span className="text-micro font-semibold text-ink uppercase">
              Ranked Outage Candidates ({queue.length} Total)
            </span>
          </div>
          <span className="font-mono text-micro text-ink-3">Sorted by Grid Impact Score (Desc)</span>
        </div>

        <div className="overflow-x-auto">
          <Table size="sm" useZebraStyles={false}>
            <TableHead>
              <TableRow className="text-micro">
                <TableHeader>Rank</TableHeader>
                <TableHeader>Asset ID</TableHeader>
                <TableHeader>Type &amp; Area</TableHeader>
                <TableHeader>Failure Prob.</TableHeader>
                <TableHeader className="text-right">Customers</TableHeader>
                <TableHeader className="text-right">Grid Impact</TableHeader>
                <TableHeader>Recommended Action</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {queue.map((item, idx) => (
                <TableRow
                  key={item.asset_id}
                  onClick={() => router.push(`/assets?assetId=${item.asset_id}`)}
                  className={`hover:bg-sunken cursor-pointer transition-colors ${
                    idx === 0 ? "bg-sev-normal-tint/20 font-semibold" : ""
                  }`}
                >
                  <TableCell className="font-mono">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-5 rounded text-micro font-bold ${
                        item.priority === "CRITICAL"
                          ? "bg-sev-critical-tint text-sev-critical"
                          : "bg-sunken text-ink"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono font-bold text-brand-ink">
                    {item.asset_id}
                  </TableCell>
                  <TableCell>
                    <div className="text-ink text-label">{item.asset_type}</div>
                    <div className="text-micro text-ink-3 font-mono">
                      {item.geographic_area || item.area}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-bold text-sev-critical">
                    {F.pct(item.failure_probability)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-micro">
                    {F.num(item.customers_served)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-ink">
                    {F.score(item.grid_impact_score)}
                  </TableCell>
                  <TableCell className="text-micro max-w-xs truncate">
                    {item.recommended_action || "Immediate diagnostic inspection"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                      <Button
                        kind="danger--tertiary"
                        size="sm"
                        onClick={() => handleDispatch(item.asset_id)}
                      >
                        Dispatch
                      </Button>
                      <Button size="sm" onClick={() => handleSchedule(item.asset_id)}>
                        Schedule
                      </Button>
                      <Button kind="ghost" size="sm" onClick={() => handleDefer(item.asset_id)}>
                        Defer
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
