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
  FileText,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { API } from "@/lib/api";

// Grouped, because nine flat entries give an operator no map of the console.
// The grouping follows how the work actually runs: watch what is happening,
// then act on it, then reason about what might happen.
const NAV_GROUPS = [
  {
    heading: "Monitor",
    items: [
      { id: "overview", href: "/overview", label: "Overview", icon: LayoutGrid },
      { id: "assets", href: "/assets", label: "Assets", icon: Cpu },
      { id: "risk-areas", href: "/risk-areas", label: "Risk & Areas", icon: Shield },
      { id: "grid-map", href: "/grid-map", label: "Grid Map", icon: MapIcon },
    ],
  },
  {
    heading: "Respond",
    items: [
      { id: "maintenance", href: "/maintenance", label: "Maintenance", icon: Wrench },
      { id: "crews", href: "/crews", label: "Crews", icon: Truck },
    ],
  },
  {
    heading: "Plan",
    items: [
      { id: "simulation", href: "/simulation", label: "Simulation", icon: Sliders },
      { id: "operator-brief", href: "/operator-brief", label: "Operator Brief", icon: FileText },
    ],
  },
];

export const Sidebar: React.FC<{
  onOpenMetrics?: () => void;
  /** Below lg the sidebar is an overlay drawer rather than a permanent column,
   *  because a fixed 240px rail on a 900px-wide laptop leaves the asset table
   *  too narrow to read. */
  open?: boolean;
  onClose?: () => void;
}> = ({ onOpenMetrics, open = false, onClose }) => {
  const pathname = usePathname();
  // Collapsed to an icon rail. Persisted because it is a workspace preference:
  // an operator who wants the map wide should not re-collapse it every visit.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("grid_rail_collapsed") === "1";
    setCollapsed(saved);
    document.documentElement.dataset.rail = saved ? "collapsed" : "expanded";
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      // The width lives in a CSS variable on <html>, so the breadcrumb, main
      // column and metrics drawer follow without each tracking this state.
      document.documentElement.dataset.rail = next ? "collapsed" : "expanded";
      localStorage.setItem("grid_rail_collapsed", next ? "1" : "0");
      return next;
    });
  };
  const [stats, setStats] = useState<{ telemetryRows?: number; activeOutages?: number }>({});

  // Route changed: the drawer has done its job.
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes it, the way any dismissible overlay should.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    API.stats()
      .then((s) => {
        setStats({
          telemetryRows: s?.telemetry_rows || s?.total_rows,
          activeOutages: s?.critical_assets ?? s?.active_outages,
        });
      })
      .catch(() => setStats({}));
  }, []);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 top-topbar z-30 bg-ink/25 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Console sections"
        className={`rail-anim fixed left-0 top-topbar bottom-0 w-[var(--spacing-rail)] bg-rail border-r border-line z-40 flex flex-col justify-between overflow-x-hidden overflow-y-auto select-none lg:translate-x-0 ${
          open ? "translate-x-0 shadow-overlay" : "-translate-x-full"
        }`}
      >
      <nav className="py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-3 mb-1.5 border-t border-line" aria-hidden="true" />
            ) : (
              <div className="px-4 pb-1.5 text-micro uppercase font-semibold text-ink-3 tracking-[0.09em]">
                {group.heading}
              </div>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname.startsWith(item.href) ||
                  (item.href === "/overview" && pathname === "/");

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`relative flex items-center rounded-lg min-h-9 text-label transition-colors ${
                        collapsed ? "justify-center px-0" : "gap-3 pl-3.5 pr-3"
                      } ${
                        isActive
                          ? "bg-panel text-ink font-semibold shadow-panel"
                          : "text-ink-2 font-medium hover:bg-sunken hover:text-ink"
                      }`}
                    >
                      {/* The active marker is a shape, not just a fill, so the
                          current location survives greyscale and high contrast. */}
                      <span
                        className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${
                          isActive ? "bg-brand" : "bg-transparent"
                        }`}
                        aria-hidden="true"
                      />
                      <Icon
                        className={`w-4 h-4 shrink-0 ${isActive ? "text-brand" : "text-ink-3"}`}
                        aria-hidden="true"
                      />
                      {/* Kept in the accessible tree when collapsed: a screen
                          reader still needs the destination name, even though
                          the label is visually hidden. */}
                      <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-line bg-canvas/60">
        <div className={`rounded-lg border border-line bg-panel p-3 space-y-2 ${collapsed ? "hidden" : ""}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-micro text-ink-3">Telemetry rows</span>
            <span className="font-mono text-label font-semibold text-ink">
              {stats.telemetryRows != null ? stats.telemetryRows.toLocaleString("en-US") : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-micro text-ink-3">Predicted outages</span>
            <span className="font-mono text-label font-semibold text-sev-critical">
              {stats.activeOutages != null ? stats.activeOutages : "—"}
            </span>
          </div>
        </div>

        <div className={`mt-2.5 flex justify-center ${collapsed ? "hidden" : ""}`}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1 text-micro font-semibold text-ink-2 uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-sev-watch" aria-hidden="true" />
            Simulation data
          </span>
        </div>

        {onOpenMetrics && (
          <button
            onClick={onOpenMetrics}
            title={collapsed ? "Metrics & health" : undefined}
            className="w-full mt-2.5 min-h-9 rounded-lg border border-line bg-panel hover:bg-sunken text-ink text-label font-medium flex items-center justify-center gap-2"
          >
            <Activity className="w-4 h-4 text-ink-3" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : undefined}>Metrics &amp; health</span>
          </button>
          )}

        {/* Collapse control. Desktop only: under lg the rail is already a
            dismissible drawer, so a second collapsed state would just be a
            confusing third mode. */}
        <button
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex w-full mt-2 min-h-9 rounded-lg border border-transparent hover:border-line hover:bg-sunken text-ink-3 hover:text-ink text-label font-medium items-center justify-center gap-2"
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            : <PanelLeftClose className="w-4 h-4" aria-hidden="true" />}
          <span className={collapsed ? "sr-only" : undefined}>Collapse</span>
        </button>
        </div>
      </aside>
    </>
  );
};
