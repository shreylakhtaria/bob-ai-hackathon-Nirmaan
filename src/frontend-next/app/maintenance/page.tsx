"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import { ProofOfWorkModal } from "@/components/crews/ProofOfWorkModal";
import type { ResolutionResponse, WorkOrder } from "@/types/grid";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { Certificate, Renew, Tools } from "@carbon/icons-react";

export default function MaintenancePage() {
  const router = useRouter();
  const { ok, warn, err } = useToast();

  const { data: queue = [], isLoading, refetch } = useQuery({
    queryKey: ["maintenance-queue"],
    queryFn: () => API.maintenance("?limit=50"),
  });

  // Fetch open work orders so we can show Jira keys and enable PoW modal
  const { data: woData, refetch: refetchWOs } = useQuery({
    queryKey: ["maintenance-work-orders"],
    queryFn: () => API.workOrders("?status=OPEN&limit=200"),
  });

  const handleDispatch = async (assetId: string) => {
    try {
      const res = await API.dispatch(assetId);
      ok(res.message || `Dispatched crew to ${assetId}`);
      refetch();
      refetchWOs();
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
      refetchWOs();
    } catch (e: any) {
      err(e.message || "Schedule failed");
    }
  };

  // ── Proof-of-Work modal state ──────────────────────────────────────────────
  const [powModalWO, setPowModalWO] = React.useState<WorkOrder | null>(null);

  const workOrders: WorkOrder[] = Array.isArray(woData) ? woData : [];

  // Build lookup: asset_id → latest open work order
  const assetWOMap: Record<string, WorkOrder> = {};
  for (const wo of workOrders) {
    if (wo.status === "OPEN" && wo.asset_id) {
      // Keep the most recent (highest wo_id)
      if (!assetWOMap[wo.asset_id] ||
          wo.wo_id > assetWOMap[wo.asset_id].wo_id) {
        assetWOMap[wo.asset_id] = wo;
      }
    }
  }

  const handleOpenPoW = (assetId: string) => {
    const wo = assetWOMap[assetId];
    if (!wo) {
      err("No open work order for this asset. Dispatch or schedule first.");
      return;
    }
    setPowModalWO(wo);
  };

  const handleResolved = (res: ResolutionResponse) => {
    setPowModalWO(null);
    const before = res.risk_before?.grid_impact_score;
    const after = res.risk_after?.grid_impact_score;
    const delta =
      before != null && after != null
        ? ` Risk: ${before.toFixed(1)} → ${after.toFixed(1)}.`
        : "";
    ok(`Work order closed & grid re-scored.${delta}`);
    refetch();
    refetchWOs();
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
          onClick={() => { refetch(); refetchWOs(); }}
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
                <TableHeader>Ticket</TableHeader>
                <TableHeader>Recommended Action</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {queue.map((item, idx) => {
                const wo = assetWOMap[item.asset_id];
                return (
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

                    {/* Enterprise ticket reference */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {wo?.jira_key ? (
                        <div className="flex flex-col gap-0.5">
                          <a
                            href={wo.jira_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-micro text-brand-ink hover:underline"
                            title={`Open ${wo.jira_key} in enterprise tracker`}
                          >
                            🎫 {wo.jira_key}
                          </a>
                          {wo.field_status && (
                            <Tag
                              type={
                                wo.field_status === "COMPLETED"
                                  ? "green"
                                  : wo.field_status === "ON_SITE" || wo.field_status === "RESOLVING"
                                  ? "blue"
                                  : "cool-gray"
                              }
                              size="sm"
                            >
                              {wo.field_status}
                            </Tag>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-micro text-ink-3">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-micro max-w-xs truncate">
                      {item.recommended_action || "Immediate diagnostic inspection"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1.5 justify-end flex-nowrap whitespace-nowrap min-w-max" onClick={(e) => e.stopPropagation()}>
                        <Button
                          kind="primary"
                          size="sm"
                          onClick={() => handleDispatch(item.asset_id)}
                        >
                          Dispatch
                        </Button>
                        <Button
                          kind="tertiary"
                          size="sm"
                          onClick={() => handleSchedule(item.asset_id)}
                        >
                          Schedule
                        </Button>
                        {wo && (
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Certificate}
                            onClick={() => handleOpenPoW(item.asset_id)}
                            title="Record field proof-of-work and close this work order"
                            aria-label={`Open proof-of-work for ${item.asset_id}`}
                          >
                            PoW
                          </Button>
                        )}
                        <Button kind="ghost" size="sm" onClick={() => handleDefer(item.asset_id)}>
                          Defer
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Proof-of-Work Modal */}
      {powModalWO && (
        <ProofOfWorkModal
          isOpen={!!powModalWO}
          onClose={() => setPowModalWO(null)}
          workOrder={powModalWO}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
