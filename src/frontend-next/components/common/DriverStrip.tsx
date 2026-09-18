import React from "react";
import { F } from "@/lib/utils";

export interface Driver {
  name: string;
  /** SHAP contribution. Sign is ignored for width; magnitude is what matters. */
  value: number;
}

/**
 * The signature element of this console.
 *
 * This product's claim is that it predicts failures *and* explains them. That
 * explanation used to live only on an asset's detail page, which meant the
 * list — the screen an operator actually watches — showed a risk score with no
 * reason attached. The strip puts the top SHAP contributors inline: three
 * segments, widths proportional to contribution, named underneath. An operator
 * scanning the queue can see not just which asset is worst but what is driving
 * it, and two assets at the same score but different causes stop looking alike.
 */
export const DriverStrip: React.FC<{
  drivers?: Driver[] | null;
  level?: string;
  showLegend?: boolean;
  className?: string;
}> = ({ drivers, level, showLegend = true, className = "" }) => {
  const top = (drivers || [])
    .filter((d) => d && d.name)
    .map((d) => ({ ...d, mag: Math.abs(Number(d.value) || 0) }))
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 3);

  if (!top.length) return null;

  const total = top.reduce((s, d) => s + d.mag, 0) || 1;
  const { ink } = F.sev(level);
  // One hue, three weights: the segments differentiate by opacity rather than
  // by inventing new colours, because hue in this system means severity.
  const weights = [1, 0.62, 0.34];

  return (
    <div className={className}>
      <div
        className="driver-strip"
        role="img"
        aria-label={`Top risk drivers: ${top.map((d) => d.name).join(", ")}`}
      >
        {top.map((d, i) => (
          <span
            key={d.name}
            style={{
              width: `${(d.mag / total) * 100}%`,
              backgroundColor: ink,
              opacity: weights[i] ?? 0.3,
            }}
          />
        ))}
      </div>
      {showLegend && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {top.map((d, i) => (
            <span key={d.name} className="inline-flex items-center gap-1.5 text-micro text-ink-3">
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: ink, opacity: weights[i] ?? 0.3 }}
                aria-hidden="true"
              />
              {d.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
