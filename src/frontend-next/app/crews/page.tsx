"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import { ProofOfWorkModal } from "@/components/crews/ProofOfWorkModal";
import type { ResolutionResponse, WorkOrder } from "@/types/grid";
import {
  Button,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { Certificate, CheckmarkOutline, Compass, Delivery, Renew } from "@carbon/icons-react";

export default function CrewsPage() {
  const { ok, err } = useToast();

  const { data: crewData, isLoading: isRosterLoading, refetch: refetchRoster } = useQuery({
    queryKey: ["crews-roster"],
    queryFn: () => API.crews(),
  });

  const { data: recData, isLoading: isRecLoading, refetch: refetchRecs } = useQuery({
    queryKey: ["crews-recommendations"],
    queryFn: () => API.crewRecommendations(),
  });

  // Work orders — needed to get wo_id / jira_key for the PoW modal
  const { data: woData, refetch: refetchWOs } = useQuery({
    queryKey: ["work-orders-open"],
    queryFn: () => API.workOrders("?status=OPEN&limit=200"),
  });

  const handleAuthorize = async (crewId: string, targetArea: string) => {
    try {
      const res = await API.reposition(crewId, targetArea);
      ok(res.message || `Pre-position order authorized for ${crewId} to ${targetArea}`);
      refetchRoster();
      refetchRecs();
    } catch (e: any) {
      err(e.message || "Failed to reposition crew");
    }
  };

  // Completing a job re-scores every asset, so it is not instant. The button
  // reports what changed rather than only that the crew is free — an operator
  // who closes a repair wants to see the risk come down.
  const [completing, setCompleting] = React.useState<string | null>(null);

  const handleComplete = async (crewId: string) => {
    setCompleting(crewId);
    try {
      const res = await API.releaseCrew(crewId);
      const before = res.risk_before?.grid_impact_score;
      const after = res.risk_after?.grid_impact_score;
      const delta =
        before != null && after != null
          ? ` Grid impact ${before.toFixed(1)} → ${after.toFixed(1)}.`
          : "";
      ok((res.message || `Crew ${crewId} released`) + delta);
      refetchRoster();
      refetchRecs();
      refetchWOs();
    } catch (e: any) {
      err(e.message || "Failed to complete the job");
    } finally {
      setCompleting(null);
    }
  };

  // ── Proof-of-Work modal state ──────────────────────────────────────────────
  const [powModalWO, setPowModalWO] = React.useState<WorkOrder | null>(null);

  const handleOpenPoW = (crewId: string) => {
    const workOrders: WorkOrder[] = Array.isArray(woData) ? woData : [];
    // Find the open work order for this crew
    const wo = workOrders.find(
      (w) => w.crew_id === crewId && w.status === "OPEN",
    );
    if (!wo) {
      err("No open work order found for this crew. Dispatch one first.");
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
    refetchRoster();
    refetchRecs();
    refetchWOs();
  };

  if (isRosterLoading || isRecLoading) {
    return <ScadaSkeletonLoader />;
  }

  const crews = Array.isArray(crewData) ? crewData : (crewData?.crews || []);
  const recs = recData?.recommendations || [];
  const workOrders: WorkOrder[] = Array.isArray(woData) ? woData : [];

  // Build a quick lookup: crew_id → open work order (for Jira badge)
  const crewWOMap: Record<string, WorkOrder> = {};
  for (const wo of workOrders) {
    if (wo.status === "OPEN" && wo.crew_id) {
      crewWOMap[wo.crew_id] = wo;
    }
  }

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Logistics</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Field Crews &amp; Pre-Positioning</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Field Crews &amp; AI Response Optimization
          </h1>
          <p className="text-label text-ink-2">
            Optimizes repair crew placements to minimize outage travel times ahead of storm events.
          </p>
        </div>
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Renew}
          onClick={() => {
            refetchRoster();
            refetchRecs();
            refetchWOs();
          }}
          className="self-start md:self-auto"
        >
          Refresh roster
        </Button>
      </div>

      {/* Main Grid: Roster (7 cols) + AI Recommendations (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Roster Table */}
        <div className="lg:col-span-7 bg-panel rounded-xl shadow-panel border border-line overflow-hidden">
          <div className="px-3.5 py-2.5 bg-header flex items-center justify-between border-b border-line">
            <div className="flex items-center gap-2">
              <Delivery size={16} className="fill-current text-brand-ink" />
              <span className="text-micro font-semibold text-ink uppercase">
                Active Crew Roster ({crews.length} Crews)
              </span>
            </div>
            <span className="font-mono text-micro text-ink-3">GPS Telemetry Sync</span>
          </div>

          <div className="overflow-x-auto">
            <Table size="sm" useZebraStyles={false}>
              <TableHead>
                <TableRow className="text-micro">
                  <TableHeader>Crew ID</TableHeader>
                  <TableHeader>Specialization</TableHeader>
                  <TableHeader>Current Area</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Ticket</TableHeader>
                  <TableHeader className="text-right">Assignment / Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {crews.map((c) => {
                  const wo = crewWOMap[c.crew_id];
                  return (
                    <TableRow key={c.crew_id} className="hover:bg-sunken transition-colors">
                      <TableCell className="font-mono font-bold text-brand-ink">{c.crew_id}</TableCell>
                      <TableCell className="text-ink">{c.skill_type}</TableCell>
                      <TableCell className="font-mono text-micro">{c.current_area}</TableCell>
                      <TableCell>
                        {/* Carbon tags, on the same remapped palette as every
                            other state chip in the console: available is the
                            "normal" green, on a job is the critical red. */}
                        <Tag
                          type={
                            c.availability === "AVAILABLE"
                              ? "green"
                              : c.availability === "ON_JOB"
                                ? "red"
                                : "cool-gray"
                          }
                          size="sm"
                        >
                          {c.availability}
                        </Tag>
                      </TableCell>

                      {/* Jira ticket badge */}
                      <TableCell>
                        {wo?.jira_key ? (
                          <a
                            href={wo.jira_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-micro text-brand-ink hover:underline flex items-center gap-0.5"
                            title={`Open ${wo.jira_key} in Jira`}
                          >
                            🎫 {wo.jira_key}
                          </a>
                        ) : (
                          <span className="font-mono text-micro text-ink-3">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {c.active_assignment ? (
                          <div className="flex items-center justify-end gap-1.5 font-mono text-micro flex-wrap">
                            <span className="font-bold text-brand-ink">{c.active_assignment}</span>
                            {/* Proof-of-Work button — opens the 3-step evidence modal */}
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={Certificate}
                              onClick={() => handleOpenPoW(c.crew_id)}
                              aria-label={`Open field proof-of-work for ${c.active_assignment}`}
                              title="Record field evidence, advance status and close the work order"
                            >
                              Field PoW
                            </Button>
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => handleComplete(c.crew_id)}
                              disabled={completing !== null}
                              // The accessible name has to start with the visible
                              // label, or voice control cannot address the button
                              // by what it says.
                              aria-label={`Complete ${c.active_assignment} — records maintenance, stamps the asset and re-derives risk`}
                              title="Closes the work order: records maintenance, stamps the asset and re-derives risk"
                            >
                              {completing === c.crew_id ? "Completing…" : "Complete"}
                            </Button>
                          </div>
                        ) : (
                          <span className="font-mono text-micro text-ink-3">Ready for Dispatch</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* AI Pre-Positioning Recommendations */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-panel rounded-xl shadow-panel border border-line p-3.5">
            <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-line">
              <div className="flex items-center gap-1.5">
                <Compass size={16} className="fill-current text-brand-ink" />
                <span className="text-micro font-semibold uppercase text-ink">
                  AI Pre-Positioning Orders
                </span>
              </div>
              <span className="font-mono text-micro text-brand font-bold">Optimal Coverage</span>
            </div>

            <div className="space-y-3">
              {recs.length === 0 ? (
                <div className="text-center py-6 font-mono text-micro text-ink-3">
                  All high-risk areas are currently covered by active crews.
                </div>
              ) : (
                recs.map((r) => (
                  <div
                    key={r.crew_id}
                    className="bg-canvas border border-line rounded-lg p-3 flex flex-col gap-2 shadow-2xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-micro font-semibold bg-sev-critical-tint text-sev-critical px-1.5 py-0.5 rounded uppercase">
                          CRITICAL RISK AREA
                        </span>
                        <div className="text-body font-bold text-ink mt-1 font-mono">
                          {r.crew_id}{" "}
                          <span className="text-micro font-normal text-ink-3">({r.crew_skill})</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-micro font-bold text-sev-critical">
                          Cuts Response: {r.response_reduction_min} min (-
                          {Math.round((r.response_reduction_min / (r.current_response_min || 1)) * 100)}%)
                        </div>
                      </div>
                    </div>

                    <div className="text-micro text-ink-2">
                      <span className="font-semibold text-ink">MOVE:</span> {r.current_area} &rarr;{" "}
                      <span className="font-bold text-brand-ink font-mono">{r.recommended_area}</span>
                    </div>

                    <p className="text-micro text-ink-3">{r.rationale}</p>

                    <Button
                      size="sm"
                      renderIcon={CheckmarkOutline}
                      onClick={() => handleAuthorize(r.crew_id, r.recommended_area)}
                      className="cds--btn--block mt-1"
                    >
                      Authorize pre-positioning order
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
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
