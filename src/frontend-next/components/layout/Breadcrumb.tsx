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
  const title = CRUMB_TITLES[segment] || segment;

  return (
    <div className="fixed top-topbar left-0 lg:left-60 right-0 z-30 h-crumb bg-canvas/85 backdrop-blur-sm border-b border-line px-5 flex items-center justify-between select-none">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-micro min-w-0">
        <span className="text-ink-3 shrink-0">GridOps Regional Node</span>
        <span className="text-line-strong shrink-0" aria-hidden="true">/</span>
        <span className="text-ink font-medium truncate">{title}</span>
      </nav>
      <div className="flex items-center gap-4 text-micro shrink-0">
        <span className="flex items-center gap-1.5 text-ink-3">
          <span className="w-1.5 h-1.5 rounded-full bg-sev-normal" aria-hidden="true" />
          Telemetry lock
          <strong className="font-mono font-semibold text-ink">100.0%</strong>
        </span>
        <span className="text-line-strong" aria-hidden="true">|</span>
        <span className="text-ink-3">
          Latency <strong className="font-mono font-semibold text-ink">51 ms</strong>
        </span>
      </div>
    </div>
  );
};
