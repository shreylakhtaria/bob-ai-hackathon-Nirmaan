import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskLevel } from "@/types/grid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const F = {
  pct: (v?: number | null) => (v == null ? "--" : (v * 100).toFixed(0) + "%"),
  pct1: (v?: number | null) => (v == null ? "--" : (v * 100).toFixed(1) + "%"),
  num: (v?: number | null) => (v == null ? "--" : Number(v).toLocaleString()),
  score: (v?: number | null) => (v == null ? "--" : Math.round(v)),
  
  date: (s?: string | null) => {
    if (!s) return "--";
    const d = new Date(s);
    return isNaN(d.getTime())
      ? s
      : d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  },

  /**
   * The severity ramp — one function, used by every component that shows a
   * risk state, so a level can never render as two different colours on two
   * different screens.
   *
   * The old mapping was not a ramp: HIGH resolved to #376757 and LOW/NORMAL to
   * #0f5132 — both greens — while MEDIUM was grey. Severity therefore did not
   * read as a progression, which is the one thing a risk colour has to do.
   * This is monotonic in hue (green → amber → orange → red) and roughly level
   * in luminance, so it reads by hue rather than by "one is darker", and every
   * ink clears 6.7:1 on the canvas and 5.8:1 on its own tint.
   */
  sev: (lvl?: RiskLevel | string) => {
    switch ((lvl || "").toString().toUpperCase()) {
      case "CRITICAL":
      case "SEVERE":
        return { ink: "#a8130e", tint: "#fcdcda", text: "Critical", key: "critical" };
      case "HIGH":
      case "ELEVATED":
        return { ink: "#9a3412", tint: "#fbe0d2", text: "Elevated", key: "elevated" };
      case "MEDIUM":
      case "MODERATE":
      case "WATCH":
        return { ink: "#7a4d00", tint: "#fbeccb", text: "Watch", key: "watch" };
      case "LOW":
      case "NORMAL":
      case "HEALTHY":
      case "OK":
        return { ink: "#0f5132", tint: "#d7f0e2", text: "Normal", key: "normal" };
      default:
        return { ink: "#5a6575", tint: "#e9eef7", text: lvl ? String(lvl) : "Unknown", key: "unknown" };
    }
  },

  riskColor: (lvl?: RiskLevel | string) => F.sev(lvl).ink,

  riskBg: (lvl?: RiskLevel | string) => F.sev(lvl).tint,

  /** Kept for pages still calling it; now derived from the single ramp above. */
  riskBadgeClass: (lvl?: RiskLevel | string) => {
    const { key } = F.sev(lvl);
    const map: Record<string, { container: string; dot: string }> = {
      critical: { container: "bg-sev-critical-tint text-sev-critical border border-sev-critical/30", dot: "bg-sev-critical" },
      elevated: { container: "bg-sev-elevated-tint text-sev-elevated border border-sev-elevated/30", dot: "bg-sev-elevated" },
      watch:    { container: "bg-sev-watch-tint text-sev-watch border border-sev-watch/30",          dot: "bg-sev-watch" },
      normal:   { container: "bg-sev-normal-tint text-sev-normal border border-sev-normal/30",       dot: "bg-sev-normal" },
      unknown:  { container: "bg-sunken text-ink-3 border border-line",                              dot: "bg-ink-3" },
    };
    return map[key];
  },
};
