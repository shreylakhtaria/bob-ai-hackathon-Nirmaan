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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Logistics</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Field Crews &amp; Pre-Positioning</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Field Crews &amp; AI Response Optimization
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Optimizes repair crew placements to minimize outage travel times ahead of storm events.
          </p>
        </div>
        <button
          onClick={() => {
            refetchRoster();
            refetchRecs();
          }}
          className="h-8 px-3.5 bg-white text-[#0b1c30] border border-[#c0c9c0] rounded-md font-mono text-[11px] font-bold hover:bg-[#eff4ff] transition-colors flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#003820]" /> Refresh Roster
        </button>
      </div>

      {/* Main Grid: Roster (7 cols) + AI Recommendations (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Roster Table */}
        <div className="lg:col-span-7 bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#003820]" />
              <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
                Active Crew Roster ({crews.length} Crews)
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#707971]">GPS Telemetry Sync</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-[12.5px]">
              <thead>
                <tr className="bg-[#eff4ff] text-[#404942] font-mono text-[10px] uppercase tracking-wider border-b border-[#c0c9c0]/40">
                  <th className="py-2.5 px-3">Crew ID</th>
                  <th className="py-2.5 px-3">Specialization</th>
                  <th className="py-2.5 px-3">Current Area</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Assignment / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eff4ff]">
                {crews.map((c) => (
                  <tr key={c.crew_id} className="hover:bg-[#eff4ff] transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#003820]">{c.crew_id}</td>
                    <td className="py-2.5 px-3 text-[#0b1c30]">{c.skill_type}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#404942]">{c.current_area}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[9.5px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          c.availability === "AVAILABLE"
                            ? "bg-[#baeed9] text-[#002117]"
                            : c.availability === "ON_JOB"
                            ? "bg-[#ffdad6] text-[#ba1a1a]"
                            : "bg-[#eff4ff] text-[#404942]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.availability === "AVAILABLE" ? "bg-[#0f5132]" : "bg-[#ba1a1a]"
                          }`}
                        />
                        {c.availability}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {c.active_assignment ? (
                        <div className="flex items-center justify-end gap-1.5 font-mono text-[10px]">
                          <span className="font-bold text-[#003820]">{c.active_assignment}</span>
                          <button
                            onClick={() => handleRelease(c.crew_id)}
                            className="px-1.5 py-0.5 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#ba1a1a] rounded uppercase font-bold"
                          >
                            Release
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] text-[#707971]">Ready for Dispatch</span>
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
          <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-3.5">
            <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-[#c0c9c0]/40">
              <div className="flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-[#003820]" />
                <span className="font-mono text-[11.5px] font-bold uppercase text-[#0b1c30]">
                  AI Pre-Positioning Orders
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#0f5132] font-bold">Optimal Coverage</span>
            </div>

            <div className="space-y-3">
              {recs.length === 0 ? (
                <div className="text-center py-6 font-mono text-[11px] text-[#707971]">
                  All high-risk areas are currently covered by active crews.
                </div>
              ) : (
                recs.map((r) => (
                  <div
                    key={r.crew_id}
                    className="bg-[#f8f9ff] border border-[#c0c9c0]/60 rounded-lg p-3 flex flex-col gap-2 shadow-2xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-[9px] font-bold bg-[#ffdad6] text-[#ba1a1a] px-1.5 py-0.5 rounded uppercase">
                          CRITICAL RISK AREA
                        </span>
                        <div className="text-[14px] font-bold text-[#0b1c30] mt-1 font-mono">
                          {r.crew_id}{" "}
                          <span className="text-[11px] font-normal text-[#707971]">({r.crew_skill})</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[11px] font-bold text-[#ba1a1a]">
                          Cuts Response: {r.response_reduction_min} min (-
                          {Math.round((r.response_reduction_min / (r.current_response_min || 1)) * 100)}%)
                        </div>
                      </div>
                    </div>

                    <div className="text-[11.5px] text-[#404942]">
                      <span className="font-semibold text-[#0b1c30]">MOVE:</span> {r.current_area} &rarr;{" "}
                      <span className="font-bold text-[#003820] font-mono">{r.recommended_area}</span>
                    </div>

                    <p className="text-[11px] text-[#707971]">{r.rationale}</p>

                    <button
                      onClick={() => handleAuthorize(r.crew_id, r.recommended_area)}
                      className="w-full mt-1 h-7 bg-[#0f5132] text-white font-mono text-[10.5px] font-bold rounded uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm"
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
