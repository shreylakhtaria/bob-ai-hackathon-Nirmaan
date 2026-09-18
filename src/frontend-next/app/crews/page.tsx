"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, CheckCircle2, Clock, RotateCw, Navigation } from "lucide-react";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";

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

  const handleRelease = async (crewId: string) => {
    try {
      const res = await API.releaseCrew(crewId);
      ok(res.message || `Crew ${crewId} released`);
      refetchRoster();
      refetchRecs();
    } catch (e: any) {
      err(e.message || "Failed to release crew");
    }
  };

  if (isRosterLoading || isRecLoading) {
    return <ScadaSkeletonLoader />;
  }

  const crews = Array.isArray(crewData) ? crewData : (crewData?.crews || []);
  const recs = recData?.recommendations || [];

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
        <button
          onClick={() => {
            refetchRoster();
            refetchRecs();
          }}
          className="min-h-9 px-3.5 bg-panel text-ink border border-line rounded-lg font-mono text-micro font-bold hover:bg-sunken transition-colors flex items-center gap-1.5 shadow-panel self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-brand-ink" /> Refresh Roster
        </button>
      </div>

      {/* Main Grid: Roster (7 cols) + AI Recommendations (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Roster Table */}
        <div className="lg:col-span-7 bg-panel rounded-xl shadow-panel border border-line overflow-hidden">
          <div className="px-3.5 py-2.5 bg-header flex items-center justify-between border-b border-line">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand-ink" />
              <span className="text-micro font-semibold text-ink uppercase">
                Active Crew Roster ({crews.length} Crews)
              </span>
            </div>
            <span className="font-mono text-micro text-ink-3">GPS Telemetry Sync</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-label">
              <thead>
                <tr className="bg-sunken text-ink-2 text-micro uppercase tracking-wider border-b border-line">
                  <th className="py-2.5 px-3">Crew ID</th>
                  <th className="py-2.5 px-3">Specialization</th>
                  <th className="py-2.5 px-3">Current Area</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Assignment / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sunken">
                {crews.map((c) => (
                  <tr key={c.crew_id} className="hover:bg-sunken transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-brand-ink">{c.crew_id}</td>
                    <td className="py-2.5 px-3 text-ink">{c.skill_type}</td>
                    <td className="py-2.5 px-3 font-mono text-micro text-ink-2">{c.current_area}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-micro font-bold px-2 py-0.5 rounded-full uppercase ${
                          c.availability === "AVAILABLE"
                            ? "bg-sev-normal-tint text-sev-normal"
                            : c.availability === "ON_JOB"
                            ? "bg-sev-critical-tint text-sev-critical"
                            : "bg-sunken text-ink-2"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.availability === "AVAILABLE" ? "bg-brand" : "bg-sev-critical"
                          }`}
                        />
                        {c.availability}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {c.active_assignment ? (
                        <div className="flex items-center justify-end gap-1.5 font-mono text-micro">
                          <span className="font-bold text-brand-ink">{c.active_assignment}</span>
                          <button
                            onClick={() => handleRelease(c.crew_id)}
                            className="px-1.5 py-0.5 bg-sunken hover:bg-header text-sev-critical rounded uppercase font-semibold"
                          >
                            Release
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-micro text-ink-3">Ready for Dispatch</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Pre-Positioning Recommendations */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-panel rounded-xl shadow-panel border border-line p-3.5">
            <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-line">
              <div className="flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-brand-ink" />
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

                    <button
                      onClick={() => handleAuthorize(r.crew_id, r.recommended_area)}
                      className="w-full mt-1 min-h-8 bg-brand text-white text-micro font-semibold rounded uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-panel"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Authorize Pre-Positioning Order
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
