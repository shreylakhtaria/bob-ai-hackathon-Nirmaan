"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Button,
  SideNav,
  SideNavDivider,
  SideNavItems,
  SideNavLink,
  Tag,
} from "@carbon/react";
import {
  Activity,
  ChartLineData,
  DataBase,
  Dashboard,
  Delivery,
  Document,
  Map as MapIcon,
  SettingsAdjust,
  Thunderstorm,
  Notification,
  SidePanelClose,
  SidePanelOpen,
  Tools,
  UserAdmin,
} from "@carbon/icons-react";
import { useAuth } from "@/context/AuthContext";
import { API } from "@/lib/api";

// Grouped, because nine flat entries give an operator no map of the console.
// The grouping follows how the work actually runs: watch what is happening,
// then act on it, then reason about what might happen.
const NAV_GROUPS = [
  {
    heading: "Monitor",
    items: [
      { id: "overview", href: "/overview", label: "Overview", icon: Dashboard },
      { id: "assets", href: "/assets", label: "Assets", icon: ChartLineData },
      { id: "risk-areas", href: "/risk-areas", label: "Risk & Areas", icon: Thunderstorm },
      { id: "grid-map", href: "/grid-map", label: "Grid Map", icon: MapIcon },
    ],
  },
  {
    heading: "Respond",
    items: [
      { id: "maintenance", href: "/maintenance", label: "Maintenance", icon: Tools },
      { id: "crews", href: "/crews", label: "Crews", icon: Delivery },
      { id: "data-onboarding", href: "/data-onboarding", label: "Data Onboarding", icon: DataBase },
      { id: "notifications", href: "/notifications", label: "Notifications", icon: Notification },
    ],
  },
  {
    heading: "Plan",
    items: [
      { id: "simulation", href: "/simulation", label: "Simulation", icon: SettingsAdjust },
      { id: "operator-brief", href: "/operator-brief", label: "Operator Brief", icon: Document },
    ],
  },
  {
    heading: "Admin",
    items: [
      { id: "admin-pow", href: "/admin", label: "Proof of Work", icon: UserAdmin },
    ],
  },
];

/**
 * The Carbon UI Shell side nav.
 *
 * Carbon's own rail mode expands on hover, which is wrong here: the rail width
 * is a CSS variable that the breadcrumb, the main column and the metrics
 * drawer all read, and a width that changed when the pointer passed over it
 * would shift the whole page under the operator's cursor. So the collapse is
 * explicit and persisted, and `--spacing-rail` is switched by a data attribute
 * on <html> — Carbon's structure and styling, this console's collapse
 * behaviour.
 */
export const Sidebar: React.FC<{
  onOpenMetrics?: () => void;
  /** Below lg the sidebar is an overlay drawer rather than a permanent column,
   *  because a fixed rail on a 900px-wide laptop leaves the asset table too
   *  narrow to read. */
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
}> = ({ onOpenMetrics, open = false, onClose, collapsed = false }) => {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
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

  // Gated on the session: the rail renders outside RequireAuth, so without this
  // it fetched before the refresh cookie had been exchanged and spent a 401 on
  // every cold load.
  useEffect(() => {
    if (!isAuthenticated) return;
    API.stats()
      .then((s) => {
        setStats({
          telemetryRows: s?.telemetry_rows || s?.total_rows,
          activeOutages: s?.critical_assets ?? s?.active_outages,
        });
      })
      .catch(() => setStats({}));
  }, [isAuthenticated]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 top-topbar z-30 bg-ink/25 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <SideNav
        aria-label="Console sections"
        isPersistent
        expanded={open}
        isChildOfHeader={false}
        className={`shell-rail rail-anim ${collapsed ? "shell-rail--collapsed" : ""}`}
      >
        <SideNavItems>
          {NAV_GROUPS.map((group, gi) => (
            <React.Fragment key={group.heading}>
              {gi > 0 && <SideNavDivider />}
              {!collapsed && (
                <li
                  aria-hidden="true"
                  className="px-4 pt-3 pb-1 text-micro uppercase font-semibold text-ink-3 tracking-[0.09em]"
                >
                  {group.heading}
                </li>
              )}
              {group.items.map((item) => {
                const isActive =
                  pathname.startsWith(item.href) ||
                  (item.href === "/overview" && pathname === "/");
                return (
                  <SideNavLink
                    key={item.id}
                    as={Link}
                    href={item.href}
                    renderIcon={item.icon}
                    isActive={isActive}
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    {/* Kept in the accessible tree when collapsed: a screen
                        reader still needs the destination name, even though the
                        label is visually hidden. */}
                    <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
                  </SideNavLink>
                );
              })}
            </React.Fragment>
          ))}
        </SideNavItems>

        <div className="mt-auto p-3 border-t border-line">
          <div className={collapsed ? "hidden" : "border border-line bg-panel p-3 space-y-2"}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-micro text-ink-3">Telemetry rows</span>
              <span className="font-mono text-label font-semibold text-ink">
                {stats.telemetryRows != null
                  ? stats.telemetryRows.toLocaleString("en-US")
                  : "—"}
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
            <Tag type="warm-gray" size="sm">
              Simulation data
            </Tag>
          </div>

          {onOpenMetrics && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Activity}
              onClick={onOpenMetrics}
              title={collapsed ? "Metrics & health" : undefined}
              className="cds--btn--block mt-2.5"
            >
              <span className={collapsed ? "sr-only" : undefined}>Metrics &amp; health</span>
            </Button>
          )}
        </div>
      </SideNav>
    </>
  );
};
