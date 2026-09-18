"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Cpu,
  Shield,
  Wrench,
  Truck,
  Map as MapIcon,
  Sliders,
  Terminal,
  FileText,
  Activity,
  User as UserIcon,
} from "lucide-react";
import { API } from "@/lib/api";

const NAV_ITEMS = [
  { id: "overview", href: "/overview", label: "Overview", icon: LayoutGrid },
  { id: "assets", href: "/assets", label: "Assets", icon: Cpu },
  { id: "risk-areas", href: "/risk-areas", label: "Risk & Areas", icon: Shield },
  { id: "maintenance", href: "/maintenance", label: "Maintenance", icon: Wrench },
  { id: "crews", href: "/crews", label: "Crews", icon: Truck },
  { id: "grid-map", href: "/grid-map", label: "Grid Map", icon: MapIcon },
  { id: "simulation", href: "/simulation", label: "Simulation", icon: Sliders },
  { id: "copilot", href: "/copilot", label: "Copilot", icon: Terminal },
  { id: "operator-brief", href: "/operator-brief", label: "Operator Brief", icon: FileText },
  { id: "profile", href: "/profile", label: "Operator Profile", icon: UserIcon },
];

export const Sidebar: React.FC<{ onOpenMetrics?: () => void }> = ({ onOpenMetrics }) => {
  const pathname = usePathname();
  const [stats, setStats] = useState<{ telemetryRows?: number; activeOutages?: number }>({});

  useEffect(() => {
    API.stats()
      .then((s) => {
        setStats({
          telemetryRows: s?.telemetry_rows || s?.total_rows || 111100,
          activeOutages: s?.critical_assets || s?.active_outages || 19,
        });
      })
      .catch(() => {
        setStats({ telemetryRows: 111100, activeOutages: 19 });
      });
  }, []);

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-[#eff4ff] border-r border-[#c0c9c0] z-40 flex flex-col justify-between overflow-y-auto select-none">
      <div className="py-2.5">
        <div className="px-3.5 pb-1 font-mono text-[10.5px] uppercase font-semibold text-[#404942] tracking-wider">
          Operational Navigation
        </div>
        <nav className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href) || (item.href === "/overview" && pathname === "/");

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-md transition-colors text-[13px] font-medium ${
                  isActive
                    ? "bg-[#0f5132] text-white font-semibold shadow-sm"
                    : "text-[#404942] hover:bg-[#dce9ff] hover:text-[#0b1c30]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-[#707971]"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Telemetry Widget */}
      <div className="p-3.5 border-t border-[#c0c9c0] bg-[#f8f9ff]">
        <div className="bg-white border border-[#c0c9c0]/80 p-2.5 rounded-lg space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-[#404942] uppercase">Telemetry Rows</span>
            <span className="font-semibold text-[#003820]">
              {(stats.telemetryRows || 111100).toLocaleString("en-US")}
            </span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-[#404942] uppercase">Predicted Outages</span>
            <span className="font-semibold text-[#ba1a1a]">
              {stats.activeOutages || 19} Active
            </span>
          </div>
        </div>

        <div className="mt-2 text-center">
          <span className="inline-flex items-center gap-1.5 bg-[#e5eeff] px-2 py-0.5 rounded-full border border-[#c0c9c0] font-mono text-[9.5px] font-bold text-[#404942] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#376757] animate-pulse inline-block" />
            SIMULATION DATA
          </span>
        </div>

        {onOpenMetrics && (
          <button
            onClick={onOpenMetrics}
            className="w-full mt-2 h-7 bg-[#e5eeff] border border-[#c0c9c0] hover:bg-[#dce9ff] text-[#0b1c30] font-mono text-[11px] rounded-md flex items-center justify-center gap-1.5 transition-colors font-medium shadow-sm"
          >
            <Activity className="w-3.5 h-3.5 text-[#003820]" />
            Metrics &amp; Health Drawer
          </button>
        )}
      </div>
    </aside>
  );
};
