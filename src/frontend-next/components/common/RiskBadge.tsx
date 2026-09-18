import React from "react";
import { F } from "@/lib/utils";
import type { RiskLevel } from "@/types/grid";

interface RiskBadgeProps {
  level?: RiskLevel | string;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level = "LOW", className = "" }) => {
  const { ink, tint, text } = F.sev(level);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-semibold uppercase tracking-wide ${className}`}
      style={{ backgroundColor: tint, color: ink, borderColor: `${ink}33` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: ink }}
        aria-hidden="true"
      />
      {text}
    </span>
  );
};
