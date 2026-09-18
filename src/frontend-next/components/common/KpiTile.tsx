import React from "react";
import { F } from "@/lib/utils";
import type { RiskLevel } from "@/types/grid";

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  level?: RiskLevel | string;
  /** 0–1. Draws the fill bar under the figure, so magnitude is legible
   *  without reading the number. Omit when the value has no range. */
  fill?: number;
}

export const KpiTile: React.FC<KpiTileProps> = ({ icon, label, value, sub, level, fill }) => {
  const { ink, tint, text } = F.sev(level);

  return (
    <div className="group relative bg-panel rounded-xl border border-line shadow-panel overflow-hidden hover:border-line-strong hover:shadow-raised transition-[border-color,box-shadow]">
      {/* Severity rail. Colour is never the only carrier — the state is
          spelled out in `text` below, for screen readers and for anyone who
          doesn't separate these hues. */}
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: ink }} aria-hidden="true" />

      <div className="pl-5 pr-4 py-3.5">
        <div className="flex items-center gap-2 text-ink-3">
          <span style={{ color: ink }} aria-hidden="true">{icon}</span>
          <span className="text-micro font-semibold uppercase tracking-[0.07em] truncate">
            {label}
          </span>
        </div>

        <div className="mt-2 font-mono text-metric font-semibold text-ink leading-none tracking-tight">
          {value}
        </div>

        {typeof fill === "number" && (
          <div className="mt-2.5 h-1 w-full rounded-full bg-sunken overflow-hidden" aria-hidden="true">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, Math.min(100, fill * 100))}%`, backgroundColor: ink }}
            />
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 min-h-[1.25rem]">
          <span
            className="inline-flex items-center rounded px-1.5 py-px text-micro font-semibold uppercase tracking-wide"
            style={{ backgroundColor: tint, color: ink }}
          >
            {text}
          </span>
          {sub && <span className="text-micro text-ink-3 truncate">{sub}</span>}
        </div>
      </div>
    </div>
  );
};
