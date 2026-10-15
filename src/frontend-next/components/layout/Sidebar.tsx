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
  UploadCloud,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { API } from "@/lib/api";

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// MONITOR — situational awareness: what's happening on the grid right now.
// RESPOND — action: dispatch, simulate, ask the copilot.
// PLAN — prep and admin: briefing, data onboarding, operator account.
const NAV_GROUPS: NavGroup[] = [
  {
    id: "monitor",
    label: "Monitor",
    items: [
      { id: "overview", href: "/overview", label: "Overview", icon: LayoutGrid },
      { id: "assets", href: "/assets", label: "Assets", icon: Cpu },
      { id: "risk-areas", href: "/risk-areas", label: "Risk & Areas", icon: Shield },
      { id: "grid-map", href: "/grid-map", label: "Grid Map", icon: MapIcon },
    ],
  },
  {
    id: "respond",
    label: "Respond",
    items: [
      { id: "maintenance", href: "/maintenance", label: "Maintenance", icon: Wrench },
      { id: "crews", href: "/crews", label: "Crews", icon: Truck },
      { id: "simulation", href: "/simulation", label: "Simulation", icon: Sliders },
      { id: "copilot", href: "/copilot", label: "Copilot", icon: Terminal },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    items: [
      { id: "operator-brief", href: "/operator-brief", label: "Operator Brief", icon: FileText },
      { id: "data-onboarding", href: "/data-onboarding", label: "Data Onboarding", icon: UploadCloud },
      { id: "profile", href: "/profile", label: "Operator Profile", icon: UserIcon },
    ],
  },
];

interface SidebarProps {
  onOpenMetrics?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenMetrics, collapsed = false, onToggleCollapsed }) => {
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
    <aside
      className={`fixed left-0 top-16 bottom-0 bg-[#eff4ff] border-r border-[#c0c9c0] z-40 flex flex-col justify-between overflow-y-auto overflow-x-hidden select-none transition-[width] duration-200 ${
        collapsed ? "w-[68px]" : "w-64"
      }`}
    >
      <div className="py-2.5">
        <div className="flex items-center justify-between px-2 pb-1">
          {!collapsed && (
            <span className="px-1.5 font-mono text-[10.5px] uppercase font-semibold text-[#404942] tracking-wider">
              Operational Navigation
            </span>
          )}
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-[#707971] hover:bg-[#dce9ff] hover:text-[#0b1c30] transition-colors ${
                collapsed ? "mx-auto" : ""
              }`}
            >
              {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            </button>
          )}
        </div>

        <nav className="space-y-3 px-2 mt-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {!collapsed && (
                <div className="px-3.5 pb-1 font-mono text-[9.5px] uppercase font-bold text-[#8a938c] tracking-widest">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname.startsWith(item.href) || (item.href === "/overview" && pathname === "/");

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-3 rounded-md transition-colors text-[13px] font-medium ${
                        collapsed ? "justify-center px-0 py-2" : "px-3.5 py-2"
                      } ${
                        isActive
                          ? "bg-[#0f5132] text-white font-semibold shadow-sm"
                          : "text-[#404942] hover:bg-[#dce9ff] hover:text-[#0b1c30]"
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-[#707971]"}`} />
                      {!collapsed && item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Telemetry Widget */}
      <div className="p-3.5 border-t border-[#c0c9c0] bg-[#f8f9ff]">
        {!collapsed ? (
          <>
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
          </>
        ) : (
          onOpenMetrics && (
            <button
              onClick={onOpenMetrics}
              title="Metrics & Health Drawer"
              className="w-full h-8 bg-[#e5eeff] border border-[#c0c9c0] hover:bg-[#dce9ff] text-[#003820] rounded-md flex items-center justify-center transition-colors shadow-sm"
            >
              <Activity className="w-4 h-4" />
            </button>
          )
        )}
      </div>
    </aside>
  );
};
