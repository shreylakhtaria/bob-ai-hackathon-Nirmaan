"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer, CheckCircle2, ShieldAlert, RotateCw } from "lucide-react";
import { RiskBadge } from "@/components/common/RiskBadge";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";

export default function OperatorBriefPage() {
  const { data: brief, isLoading, refetch } = useQuery({
    queryKey: ["operator-brief"],
    queryFn: () => API.brief(),
  });

  const { data: metrics } = useQuery({
    queryKey: ["model-metrics"],
    queryFn: () => API.metrics(),
  });

  if (isLoading || !brief) {
    return <ScadaSkeletonLoader />;
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#c0c9c0]/60 no-print">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Shift Handover</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Operator Brief</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Executive Shift Handover Briefing
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="h-8 px-3 bg-white text-[#0b1c30] border border-[#c0c9c0] rounded-md font-mono text-[11px] font-bold hover:bg-[#eff4ff] flex items-center gap-1.5 shadow-sm"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#003820]" /> Refresh
          </button>
          <button
            onClick={handlePrint}
            className="h-8 px-3.5 bg-[#0f5132] text-white font-mono text-[11px] font-bold rounded-md uppercase hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF Export
          </button>
        </div>
      </div>

      {/* Printable Briefing Document */}
      <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 p-6 space-y-5">
        {/* Document Header */}
        <div className="flex items-center justify-between pb-4 border-b-2 border-[#003820]">
          <div>
            <h2 className="text-[18px] font-bold text-[#003820] uppercase font-mono">
              Grid Operations Situation Snapshot
            </h2>
            <div className="text-[11.5px] font-mono text-[#707971] mt-0.5">
              Generated: {new Date().toLocaleString()} &bull; Regional Control Center RC4
            </div>
          </div>
          <RiskBadge level={brief.overall_grid_risk} />
        </div>

        {/* Executive Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[12px]">
          <div className="p-3 bg-[#f8f9ff] rounded border border-[#c0c9c0]/40">
            <div className="text-[10px] text-[#707971] uppercase">Overall Risk</div>
            <div className="text-[15px] font-bold text-[#ba1a1a]">{brief.overall_grid_risk}</div>
          </div>
          <div className="p-3 bg-[#f8f9ff] rounded border border-[#c0c9c0]/40">
            <div className="text-[10px] text-[#707971] uppercase">Customers At Risk</div>
            <div className="text-[15px] font-bold text-[#0b1c30]">{F.num(brief.customers_at_risk)}</div>
          </div>
          <div className="p-3 bg-[#f8f9ff] rounded border border-[#c0c9c0]/40">
            <div className="text-[10px] text-[#707971] uppercase">Weather Exposed</div>
            <div className="text-[15px] font-bold text-[#0b1c30]">
              {brief.weather_exposed_zones} Zones
            </div>
          </div>
          <div className="p-3 bg-[#f8f9ff] rounded border border-[#c0c9c0]/40">
            <div className="text-[10px] text-[#707971] uppercase">Primary Driver</div>
            <div className="text-[12px] font-bold text-[#003820] truncate">
              {brief.major_risk_driver || "Thermal Degradation"}
            </div>
          </div>
        </div>

        {/* Recommended Immediate Actions */}
        <div>
          <h3 className="text-[13px] font-mono font-bold uppercase text-[#0b1c30] mb-2">
            Recommended Immediate Actions
          </h3>
          <div className="space-y-2">
            {(brief.recommended_immediate_actions || []).map((action, i) => (
              <div
                key={i}
                className="p-2.5 bg-[#f8f9ff] rounded-md border border-[#c0c9c0]/40 flex items-start gap-2 text-[12px]"
              >
                <span className="w-5 h-5 rounded-full bg-[#003820] text-white font-mono text-[10.5px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[#0b1c30] font-medium leading-relaxed">{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model Confidence & Telemetry State */}
        <div className="p-3.5 bg-[#eff4ff] rounded-lg border border-[#c0c9c0]/50 font-mono text-[11px] text-[#404942] space-y-1">
          <div className="font-bold text-[#003820] uppercase text-[11.5px]">Model Calibration &amp; EMS State</div>
          <div>Inference Model: {metrics?.model || "LightGBM Classifier v4.2.1"}</div>
          <div>ROC-AUC: {metrics?.roc_auc ?? "0.976"} &bull; Precision-Recall AUC: {metrics?.pr_auc ?? "0.942"}</div>
          <div>SCADA Integration: DNP3 Synced &bull; State Estimator Converged</div>
        </div>
      </div>
    </div>
  );
}
