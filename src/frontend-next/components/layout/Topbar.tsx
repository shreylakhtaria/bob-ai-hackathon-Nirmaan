"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Bell, User, LogOut, Check } from "lucide-react";
import { DebouncedInput } from "@/components/common/DebouncedInput";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { API } from "@/lib/api";

export const Topbar: React.FC = () => {
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#c0c9c0]">
      <div className="h-16 w-full px-4 flex items-center justify-between gap-4">
        {/* Brand & Status */}
        <div className="flex items-center gap-3.5 min-w-fit">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 shadow-sm border border-[#c0c9c0]/60 relative">
            <Image src="/favicon.png" alt="Grid Logo" width={32} height={32} className="object-cover" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight text-[#0b1c30] uppercase font-sans">
                Grid Equipment Failure &amp; Outage Advisor
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#dce9ff] text-[#0b1c30] rounded border border-[#c0c9c0] font-medium tracking-wide uppercase">
                SCADA / ML-EMS SYNCED
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-[#404942] font-medium mt-0.5">
              <span className="inline-flex items-center gap-1.5 text-[#ba1a1a] font-semibold bg-[#ffdad6]/50 px-2 py-0.5 rounded border border-[#ba1a1a]/30">
                <span className="inline-block w-2 h-2 rounded-full bg-[#ba1a1a] animate-pulse" />
                GRID STATUS: ELEVATED RISK
              </span>
              <span className="text-[#c0c9c0]">|</span>
              <span>Grid Time: {clock}</span>
            </div>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md mx-2">
          <DebouncedInput
            value=""
            onChange={handleGlobalSearch}
            placeholder="Search Asset ID, Substation, Area, or Crew…"
          />
        </div>

        {/* Action Controls & Operator Profile */}
        <div className="flex items-center gap-2.5 min-w-fit">
          <button
            onClick={handleEmergencyDispatch}
            className="h-8 px-3.5 bg-[#ba1a1a] text-white font-mono text-[11px] font-bold rounded-md border border-[#ba1a1a] hover:opacity-90 transition-opacity flex items-center gap-1.5 uppercase tracking-wider shadow-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Emergency Dispatch
          </button>

          {/* Export Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="h-8 px-3 bg-white text-[#0b1c30] font-mono text-[11px] font-semibold rounded-md border border-[#c0c9c0] hover:bg-[#eff4ff] transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-[#707971]" />
              Export Log
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-9 w-52 bg-white border border-[#c0c9c0] rounded-lg shadow-xl z-50 py-1 font-mono text-[11px] animate-fade-in">
                <div className="px-3 py-1 text-[9.5px] uppercase tracking-wider text-[#707971] font-bold">
                  Download CSV
                </div>
                <button
                  onClick={() => downloadCsv("maintenance")}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#eff4ff] text-[#0b1c30]"
                >
                  Maintenance queue
                </button>
                <button
                  onClick={() => downloadCsv("assets")}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#eff4ff] text-[#0b1c30]"
                >
                  Asset register
                </button>
                <button
                  onClick={() => downloadCsv("work_orders")}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#eff4ff] text-[#0b1c30]"
                >
                  Work orders
                </button>
                <button
                  onClick={() => downloadCsv("alerts")}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#eff4ff] text-[#0b1c30]"
                >
                  Alerts
                </button>
                <button
                  onClick={() => downloadCsv("audit")}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#eff4ff] text-[#0b1c30]"
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
              className="w-8 h-8 flex items-center justify-center rounded-md border border-[#c0c9c0] hover:bg-[#eff4ff] text-[#0b1c30] transition-colors relative shadow-sm"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unackedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#ba1a1a] text-white font-mono text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {unackedCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-9 w-80 max-h-[60vh] overflow-y-auto bg-white border border-[#c0c9c0] rounded-lg shadow-xl z-50 animate-fade-in">
                <div className="px-3.5 py-2 bg-[#dce9ff] border-b border-[#c0c9c0] flex items-center justify-between sticky top-0">
                  <span className="font-mono text-[11px] font-bold uppercase text-[#0b1c30]">
                    Unacknowledged Alerts
                  </span>
                  <span className="font-mono text-[10px] text-[#707971]">{unackedCount} open</span>
                </div>
                <div className="p-2 space-y-2">
                  {alerts.length === 0 ? (
                    <div className="text-center py-4 font-mono text-[11px] text-[#707971]">
                      All alerts acknowledged
                    </div>
                  ) : (
                    alerts.slice(0, 10).map((a) => (
                      <div
                        key={a.alert_id}
                        className="p-2 bg-[#f8f9ff] border border-[#c0c9c0]/60 rounded-md flex flex-col gap-1 text-[11.5px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#0b1c30]">{a.title}</span>
                          <span className="font-mono text-[9px] text-[#707971]">
                            {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#404942]">{a.reason}</p>
                        <div className="flex justify-end mt-1">
                          {!a.acknowledged ? (
                            <button
                              onClick={() => handleAckAlert(a.alert_id)}
                              className="px-2 py-0.5 bg-[#baeed9] text-[#002117] font-mono text-[9.5px] font-bold rounded uppercase hover:opacity-90 flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" /> Ack
                            </button>
                          ) : (
                            <span className="font-mono text-[9.5px] text-[#707971]">Acknowledged</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-[#c0c9c0] mx-0.5" />

          {/* User Profile / Auth */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 pl-1 hover:opacity-90"
            >
              <div className="w-8 h-8 rounded-full bg-[#0f5132] text-white flex items-center justify-center border border-[#c0c9c0] flex-shrink-0 shadow-sm">
                <User className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[12px] font-semibold text-[#0b1c30] leading-tight font-sans">
                  {user ? user.email.split("@")[0] : "M. O'Connell"}
                </span>
                <span className="font-mono text-[10px] text-[#707971] leading-tight uppercase">
                  {user ? `${user.role} - RC4` : "Lead Dispatcher - RC4"}
                </span>
              </div>
            </button>

            {userMenuOpen && user && (
              <div className="absolute right-0 top-10 w-44 bg-white border border-[#c0c9c0] rounded-lg shadow-xl z-50 py-1 font-mono text-[11px] animate-fade-in">
                <div className="px-3 py-1.5 border-b border-[#c0c9c0]/50 text-[#707971]">
                  Signed in as <strong className="text-[#0b1c30]">{user.email}</strong>
                </div>
                <button
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                    ok("Logged out successfully");
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#ffdad6]/40 text-[#ba1a1a] flex items-center gap-1.5 font-bold"
                >
                  <LogOut className="w-3.5 h-3.5" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
