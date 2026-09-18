import React from "react";
import { F } from "@/lib/utils";
import type { RiskLevel } from "@/types/grid";

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  level?: RiskLevel | string;
}

export const KpiTile: React.FC<KpiTileProps> = ({ icon, label, value, sub, level }) => {
  const accentColor = F.riskColor(level);

  return (
    <div className="bg-white rounded-lg shadow-sm p-3.5 flex gap-3 border border-[#c0c9c0]/60 hover:-translate-y-0.5 hover:shadow-md transition-all">
      <div className="w-1 rounded-full self-stretch flex-shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 text-[#404942]">
          {icon}
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold truncate">
            {label}
          </span>
        </div>
        <div className="font-mono text-[22px] font-bold text-[#0b1c30] leading-none">
          {value}
        </div>
        {sub && <div className="font-mono text-[11px] text-[#707971] mt-1 truncate">{sub}</div>}
      </div>
    </div>
  );
};
