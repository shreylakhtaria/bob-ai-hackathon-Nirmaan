"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Bell, User, LogOut, Check, Menu, X } from "lucide-react";
import { DebouncedInput } from "@/components/common/DebouncedInput";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { API } from "@/lib/api";

export const Topbar: React.FC<{ onToggleNav?: () => void; navOpen?: boolean }> = ({
  onToggleNav,
  navOpen = false,
}) => {
  const router = useRouter();
  const { ok, warn, err } = useToast();
  const { user, logout } = useAuth();

  const [clock, setClock] = useState("--:--:--");
  const [exportOpen, setExportOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unackedCount, setUnackedCount] = useState(0);

  const exportRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAlerts = () => {
    API.alerts()
      .then((data) => {
        setAlerts(data || []);
        setUnackedCount((data || []).filter((a) => !a.acknowledged).length);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 20000);
    return () => clearInterval(interval);
  }, []);

  // Dismiss dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGlobalSearch = (query: string) => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    if (q.startsWith("C-")) {
      router.push("/crews");
    } else if (["WEST-05", "NORTH-04", "CENTRAL-00", "SOUTH-02", "EAST-03", "NORTH-01"].includes(q)) {
      router.push("/risk-areas");
    } else {
      router.push(`/assets?q=${encodeURIComponent(q)}`);
    }
  };

  const handleEmergencyDispatch = async () => {
    warn("Dispatching emergency crews to highest-impact critical assets…");
    try {
      const res = await API.emergency(5);
      ok(res.message || "Emergency dispatch authorized for 5 critical assets");
      fetchAlerts();
    } catch (e: any) {
      err(e.message || "Emergency dispatch failed");
    }
  };

  const handleAckAlert = async (id: string) => {
    try {
      await API.ackAlert(id);
      ok("Alert acknowledged");
      fetchAlerts();
    } catch (e: any) {
      err(e.message || "Unable to acknowledge alert");
    }
  };

  const downloadCsv = (kind: string) => {
    ok(`Exporting ${kind.replace("_", " ")} CSV…`);
    const a = document.createElement("a");
    a.href = API.exportUrl(kind);
    a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExportOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-panel border-b border-line">
      <div className="h-topbar w-full pl-3 pr-4 sm:pr-5 flex items-center gap-3 lg:gap-5">
        {/* Below lg the nav is a drawer, so it needs a way in. */}
        <button
          onClick={onToggleNav}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          className="lg:hidden w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-line-strong bg-panel hover:bg-sunken text-ink"
        >
          {navOpen ? <X className="w-4 h-4" aria-hidden="true" /> : <Menu className="w-4 h-4" aria-hidden="true" />}
        </button>

        {/* Brand */}
        <div className="flex items-center gap-3 min-w-fit lg:w-[14.25rem]">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-line relative">
            <Image src="/favicon.png" alt="" width={32} height={32} className="object-cover" />
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-label font-semibold tracking-tight text-ink truncate">
              Grid Risk Advisor
            </span>
            <span className="font-mono text-micro text-ink-3 truncate">
              Grid time {clock}
            </span>
          </div>
        </div>

        {/* Grid state. This is the one piece of status that changes how an
            operator reads every other number on the screen, so it sits beside
            the mark rather than in a corner — and it is written out, not just
            coloured. */}
        <div className="hidden lg:flex items-center gap-2 rounded-lg border border-sev-elevated/30 bg-sev-elevated-tint pl-2.5 pr-3 py-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-sev-elevated shrink-0" aria-hidden="true" />
          <span className="text-micro uppercase tracking-wide text-ink-3">Grid status</span>
          <span className="text-label font-semibold text-sev-elevated">Elevated risk</span>
        </div>

        {/* Global Search Bar */}
        <div className="hidden md:block flex-1 min-w-0 max-w-lg">
          <DebouncedInput
            value=""
            onChange={handleGlobalSearch}
            placeholder="Search Asset ID, Substation, Area, or Crew…"
          />
        </div>

        {/* Action Controls & Operator Profile */}
        <div className="flex items-center gap-2 min-w-fit ml-auto">
          <button
            onClick={handleEmergencyDispatch}
            className="min-h-9 px-3.5 bg-sev-critical text-white text-label font-semibold rounded-lg border border-sev-critical hover:bg-[#8e0f0b] flex items-center gap-2 shadow-panel"
          >
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Dispatch crews</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative hidden sm:block" ref={exportRef}>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="min-h-9 px-3 bg-panel text-ink text-label font-medium rounded-lg border border-line-strong hover:bg-sunken flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-ink-3" aria-hidden="true" />
              Export
            </button>
            {exportOpen && (
              <div role="menu" className="absolute right-0 top-11 w-56 bg-panel border border-line rounded-xl shadow-overlay z-50 p-1.5 text-label animate-fade-in">
                <div className="px-2.5 pt-1 pb-1.5 text-micro uppercase tracking-wider text-ink-3 font-semibold">
                  Download CSV
                </div>
                <button
                  onClick={() => downloadCsv("maintenance")}
                  role="menuitem" className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-sunken text-ink"
                >
                  Maintenance queue
                </button>
                <button
                  onClick={() => downloadCsv("assets")}
                  role="menuitem" className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-sunken text-ink"
                >
                  Asset register
                </button>
                <button
                  onClick={() => downloadCsv("work_orders")}
                  role="menuitem" className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-sunken text-ink"
                >
                  Work orders
                </button>
                <button
                  onClick={() => downloadCsv("alerts")}
                  role="menuitem" className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-sunken text-ink"
                >
                  Alerts
                </button>
                <button
                  onClick={() => downloadCsv("audit")}
                  role="menuitem" className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-sunken text-ink"
                >
                  Audit log
                </button>
              </div>
            )}
          </div>

          {/* Notifications Panel */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              aria-haspopup="dialog"
              aria-expanded={notifOpen}
              aria-label={
                unackedCount > 0
                  ? `Alerts: ${unackedCount} unacknowledged`
                  : "Alerts: none unacknowledged"
              }
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-line-strong bg-panel hover:bg-sunken text-ink relative"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              {unackedCount > 0 && (
                <span aria-hidden="true" className="absolute -top-1 -right-1 bg-sev-critical text-white font-mono text-[0.625rem] min-w-[1.125rem] h-[1.125rem] px-1 rounded-full flex items-center justify-center font-semibold ring-2 ring-panel">
                  {unackedCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-[22rem] max-h-[60vh] overflow-y-auto bg-panel border border-line rounded-xl shadow-overlay z-50 animate-fade-in">
                <div className="px-4 py-2.5 bg-panel border-b border-line flex items-center justify-between sticky top-0">
                  <span className="text-label font-semibold text-ink">Unacknowledged alerts</span>
                  <span className="font-mono text-micro text-ink-3">{unackedCount} open</span>
                </div>
                <div className="p-2 space-y-2">
                  {alerts.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-label font-medium text-ink">Nothing outstanding</p>
                      <p className="mt-0.5 text-micro text-ink-3">
                        Every alert has been acknowledged.
                      </p>
                    </div>
                  ) : (
                    alerts.slice(0, 10).map((a) => (
                      <div
                        key={a.alert_id}
                        className="p-3 bg-canvas border border-line rounded-lg flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-label font-semibold text-ink">{a.title}</span>
                          <span className="font-mono text-micro text-ink-3 shrink-0">
                            {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-micro text-ink-2 leading-snug">{a.reason}</p>
                        <div className="flex justify-end mt-1">
                          {!a.acknowledged ? (
                            <button
                              onClick={() => handleAckAlert(a.alert_id)}
                              className="min-h-8 px-2.5 rounded-lg border border-line-strong bg-panel text-ink text-micro font-semibold hover:bg-sunken flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Acknowledge
                            </button>
                          ) : (
                            <span className="text-micro text-ink-3">Acknowledged</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-line mx-1" aria-hidden="true" />

          {/* User Profile / Auth */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2.5 rounded-lg pl-1 pr-2 min-h-9 hover:bg-sunken"
            >
              <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
                <User className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="hidden xl:flex flex-col text-left">
                {/* No signed-in user means no name to show. The old fallback
                    invented an operator ("M. O'Connell / Lead Dispatcher"), which
                    read as a real session on the login screen. */}
                <span className="text-label font-semibold text-ink leading-tight">
                  {user ? user.display_name || user.email.split("@")[0] : "Not signed in"}
                </span>
                <span className="text-micro text-ink-3 leading-tight">
                  {user ? user.role : "Operator console"}
                </span>
              </div>
            </button>

            {userMenuOpen && user && (
              <div role="menu" className="absolute right-0 top-11 w-56 bg-panel border border-line rounded-xl shadow-overlay z-50 p-1.5 text-label animate-fade-in">
                <div className="px-2.5 py-2 mb-1 border-b border-line text-micro text-ink-3">
                  Signed in as <strong className="font-semibold text-ink">{user.email}</strong>
                </div>
                <button
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                    ok("Logged out successfully");
                  }}
                  role="menuitem" className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-sev-critical-tint text-sev-critical flex items-center gap-2 font-medium"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
