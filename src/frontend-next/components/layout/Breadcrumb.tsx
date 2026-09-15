"use client";

import React from "react";
import { usePathname } from "next/navigation";

const CRUMB_TITLES: Record<string, string> = {
  overview: "Operations Overview",
  assets: "Asset Register & Diagnostics",
  "risk-areas": "Risk & Areas",
  maintenance: "Maintenance Queue",
  crews: "Field Crews",
  "grid-map": "Interactive Grid Map",
  simulation: "What-If Simulation",
  copilot: "AI Operations Copilot",
  "operator-brief": "Operator Brief",
};

export const Breadcrumb: React.FC = () => {
  const pathname = usePathname();
  const segment = pathname.split("/").filter(Boolean)[0] || "overview";
  const title = CRUMB_TITLES[segment] || segment.toUpperCase();

  return (
    <div className="fixed top-16 left-64 right-0 z-30 bg-[#f8f9ff] border-b border-[#c0c9c0] h-8 px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        <span className="text-[#404942] uppercase">GridOps Regional Node</span>
        <span className="text-[#c0c9c0]">/</span>
        <span className="text-[#0b1c30] font-semibold uppercase">220 Assets &bull; 8 Crews</span>
        <span className="text-[#c0c9c0]">/</span>
        <span className="text-[#003820] font-bold">{title}</span>
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px]">
        <span className="flex items-center gap-1 text-[#404942]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0f5132]" />
          Telemetry Lock: <strong className="text-[#0b1c30]">100.00%</strong>
        </span>
        <span className="text-[#c0c9c0]">|</span>
        <span className="text-[#404942]">
          LATENCY: <strong className="text-[#0b1c30]">51ms</strong>
        </span>
      </div>
    </div>
  );
};
