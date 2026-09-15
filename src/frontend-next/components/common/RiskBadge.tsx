import React from "react";
import { F } from "@/lib/utils";
import type { RiskLevel } from "@/types/grid";

interface RiskBadgeProps {
  level?: RiskLevel | string;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level = "LOW", className = "" }) => {
  const { container, dot } = F.riskBadgeClass(level);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-bold uppercase tracking-tight ${container} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${level === "CRITICAL" ? "animate-pulse" : ""}`} />
      {level}
    </span>
  );
};
