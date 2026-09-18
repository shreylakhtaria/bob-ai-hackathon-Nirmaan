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

  riskColor: (lvl?: RiskLevel | string) => {
    switch (lvl) {
      case "CRITICAL": return "#ba1a1a";
      case "HIGH": return "#376757";
      case "ELEVATED": return "#376757";
      case "MEDIUM": return "#707971";
      case "LOW":
      case "NORMAL": return "#0f5132";
      default: return "#707971";
    }
  },

  riskBg: (lvl?: RiskLevel | string) => {
    switch (lvl) {
      case "CRITICAL": return "#ffdad6";
      case "HIGH":
      case "ELEVATED": return "#dce9ff";
      case "MEDIUM": return "#e5eeff";
      case "LOW":
      case "NORMAL": return "#baeed9";
      default: return "#e5eeff";
    }
  },

  riskBadgeClass: (lvl?: RiskLevel | string) => {
    switch (lvl) {
      case "CRITICAL":
        return {
          container: "bg-[#ffdad6] text-[#93000a] border border-[#ba1a1a]/30",
          dot: "bg-[#ba1a1a]",
        };
      case "HIGH":
      case "ELEVATED":
        return {
          container: "bg-[#d3e4fe] text-[#0b1c30] border border-[#c0c9c0]",
          dot: "bg-[#376757]",
        };
      case "MEDIUM":
        return {
          container: "bg-[#e5eeff] text-[#404942] border border-[#c0c9c0]",
          dot: "bg-[#707971]",
        };
      case "LOW":
      case "NORMAL":
        return {
          container: "bg-[#baeed9] text-[#002117] border border-[#376757]/30",
          dot: "bg-[#0f5132]",
        };
      default:
        return {
          container: "bg-[#e5eeff] text-[#404942] border border-[#c0c9c0]",
          dot: "bg-[#707971]",
        };
    }
  },
};
