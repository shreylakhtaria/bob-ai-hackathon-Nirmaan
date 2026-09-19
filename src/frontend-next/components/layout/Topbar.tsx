"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Button,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  Search,
  Tag,
} from "@carbon/react";
import {
  Checkmark,
  Download,
  Send,
  Logout,
  Notification,
  User,
  WarningAlt,
} from "@carbon/icons-react";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { API } from "@/lib/api";

/**
 * The Carbon UI Shell header.
 *
 * The three menus below are hand-rolled poppers rather than Carbon's
 * HeaderPanel: HeaderPanel is a full-height right-hand slab, which is the
 * wrong shape for a five-item export list and puts the alert list a long way
 * from the bell that opened it. Everything inside them is Carbon — Button,
 * Tag, the icons — and the trigger is a Carbon HeaderGlobalAction, so the
 * shell's keyboard and focus behaviour is Carbon's.
 */
export const Topbar: React.FC<{ onToggleNav?: () => void; navOpen?: boolean }> = ({
  onToggleNav,
  navOpen = false,
}) => {
  const router = useRouter();
  const { ok, warn, err } = useToast();
  const { user, logout, isAuthenticated } = useAuth();

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

  // The chrome renders outside RequireAuth, so without this gate it polled
  // before the session had been restored from the refresh cookie: every cold
  // load spent a 401 and a retry on an alert list nobody could see yet.
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 20000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Dismiss menus on outside click, and on Escape — a menu that can only be
  // closed with the mouse is a keyboard trap.
  useEffect(() => {
    const closeAll = () => {
      setExportOpen(false);
      setNotifOpen(false);
      setUserMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
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

  // Per-alert Telegram push. Disabled while the channel is off so the button
  // cannot promise a delivery that would only be recorded as DISABLED.
  const [telegramReady, setTelegramReady] = useState(false);
  const [sendingAlert, setSendingAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    API.notificationStatus()
      .then((s) => setTelegramReady(!!s.telegram.enabled && !!s.telegram.configured))
      .catch(() => setTelegramReady(false));
  }, [isAuthenticated]);

  const handleSendTelegram = async (alertId: string) => {
    setSendingAlert(alertId);
    try {
      const res = await API.telegramSendAlert(alertId, false);
      if (res.success) {
        ok(`Sent to Telegram (id ${res.delivery.provider_message_id}).`);
      } else if (res.delivery.status === "SKIPPED") {
        // Not an error: the same condition already went out recently.
        warn(res.delivery.error_message || "Already sent recently — not re-sent.");
      } else {
        err(res.delivery.error_message || "Telegram did not accept the message.");
      }
    } catch (e: any) {
      err(e.message || "Could not send to Telegram");
    } finally {
      setSendingAlert(null);
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

  const menuItem =
    "w-full text-left px-3 py-2 text-label text-ink hover:bg-sunken focus-visible:bg-sunken";

  return (
    <Header aria-label="Grid Risk Advisor" className="shell-header">
      {/* Below lg the nav is a drawer, so it needs a way in. */}
      <HeaderMenuButton
        aria-label={navOpen ? "Close navigation" : "Open navigation"}
        isCollapsible
        isActive={navOpen}
        onClick={onToggleNav}
      />

      <HeaderName href="/overview" prefix="" className="!pl-3">
        <span className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded overflow-hidden flex items-center justify-center shrink-0 relative">
            <Image src="/favicon.png" alt="" width={28} height={28} className="object-cover" />
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span className="text-label font-semibold tracking-tight truncate">
              Grid Risk Advisor
            </span>
            {/* The clock is context, not identity: on a phone the product
                name has to win the space. */}
            <span className="hidden sm:block font-mono text-micro text-ink-3 truncate font-normal">
              Grid time {clock}
            </span>
          </span>
        </span>
      </HeaderName>

      {/* Grid state. This is the one piece of status that changes how an
          operator reads every other number on the screen, so it sits beside
          the mark rather than in a corner — and it is written out, not just
          coloured. */}
      <div className="hidden lg:flex items-center ml-3 shrink-0">
        <Tag type="magenta" size="md">
          Grid status: Elevated risk
        </Tag>
      </div>

      <div className="hidden md:block flex-1 min-w-0 max-w-lg mx-3">
        <Search
          size="sm"
          labelText="Search assets, substations, areas and crews"
          placeholder="Search Asset ID, Substation, Area, or Crew…"
          closeButtonLabelText="Clear search"
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") handleGlobalSearch((e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <HeaderGlobalBar>
        <Button
          kind="danger"
          size="sm"
          renderIcon={WarningAlt}
          onClick={handleEmergencyDispatch}
          className="!hidden sm:!inline-flex self-center mr-2"
        >
          Dispatch crews
        </Button>

        {/* Export menu */}
        <div className="relative hidden sm:block" ref={exportRef}>
          <HeaderGlobalAction
            aria-label="Export"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            isActive={exportOpen}
            onClick={() => setExportOpen((v) => !v)}
          >
            <Download size={20} />
          </HeaderGlobalAction>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full w-60 bg-panel border border-line shadow-overlay z-50 py-1 animate-fade-in"
            >
              <div className="px-3 pt-1 pb-1.5 text-micro uppercase tracking-wider text-ink-3 font-semibold">
                Print
              </div>
              {/* The browser's own print-to-PDF, against the print stylesheet in
                  globals.css. The old frontend shipped jsPDF + autotable (~124 KB)
                  to re-draw these pages by hand; printing the real page needs no
                  dependency and cannot drift from what is on screen. */}
              <button
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setExportOpen(false);
                  window.print();
                }}
              >
                Current page as PDF
              </button>
              <div className="px-3 pt-2 pb-1.5 mt-1 border-t border-line text-micro uppercase tracking-wider text-ink-3 font-semibold">
                Download CSV
              </div>
              {[
                ["maintenance", "Maintenance queue"],
                ["assets", "Asset register"],
                ["work_orders", "Work orders"],
                ["alerts", "Alerts"],
                ["audit", "Audit log"],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  role="menuitem"
                  className={menuItem}
                  onClick={() => downloadCsv(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="relative" ref={notifRef}>
          <HeaderGlobalAction
            aria-label={
              unackedCount > 0
                ? `Alerts: ${unackedCount} unacknowledged`
                : "Alerts: none unacknowledged"
            }
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            isActive={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
          >
            <span className="relative flex">
              <Notification size={20} />
              {unackedCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-2 bg-sev-critical text-white font-mono text-[0.625rem] min-w-[1.125rem] h-[1.125rem] px-1 rounded-full flex items-center justify-center font-semibold"
                >
                  {unackedCount}
                </span>
              )}
            </span>
          </HeaderGlobalAction>
          {notifOpen && (
            <div className="absolute right-0 top-full w-[22rem] max-h-[60vh] overflow-y-auto bg-panel border border-line shadow-overlay z-50 animate-fade-in">
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
                      className="p-3 bg-canvas border border-line flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label font-semibold text-ink">{a.title}</span>
                        <span className="font-mono text-micro text-ink-3 shrink-0">
                          {new Date(a.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-micro text-ink-2 leading-snug">{a.reason}</p>
                      <div className="flex justify-end items-center gap-1 mt-1">
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Send}
                          disabled={!telegramReady || sendingAlert !== null}
                          title={
                            telegramReady
                              ? "Send this alert to Telegram"
                              : "Telegram notifications are not configured"
                          }
                          onClick={() => handleSendTelegram(a.alert_id)}
                        >
                          {sendingAlert === a.alert_id ? "Sending…" : "Telegram"}
                        </Button>
                        {!a.acknowledged ? (
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={Checkmark}
                            onClick={() => handleAckAlert(a.alert_id)}
                          >
                            Acknowledge
                          </Button>
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

        {/* Operator */}
        <div className="relative" ref={userRef}>
          <HeaderGlobalAction
            aria-label="Operator menu"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            isActive={userMenuOpen}
            onClick={() => setUserMenuOpen((v) => !v)}
          >
            <User size={20} />
          </HeaderGlobalAction>
          {userMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full w-60 bg-panel border border-line shadow-overlay z-50 py-1 animate-fade-in"
            >
              {/* No signed-in user means no name to show. The old fallback
                  invented an operator ("M. O'Connell / Lead Dispatcher"), which
                  read as a real session on the login screen. */}
              <div className="px-3 py-2 mb-1 border-b border-line text-micro text-ink-3">
                {user ? (
                  <>
                    Signed in as{" "}
                    <strong className="font-semibold text-ink">{user.email}</strong>
                    <span className="block mt-0.5 capitalize">Role: {user.role}</span>
                  </>
                ) : (
                  "Not signed in"
                )}
              </div>
              {user && (
                <button
                  role="menuitem"
                  className={`${menuItem} text-sev-critical flex items-center gap-2 font-medium`}
                  onClick={async () => {
                    setUserMenuOpen(false);
                    // Awaited so the server-side revocation completes before we
                    // navigate; otherwise the request can be cancelled mid-flight
                    // and the refresh token stays valid.
                    await logout();
                    ok("Signed out");
                    router.push("/login");
                  }}
                >
                  <Logout size={16} /> Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </HeaderGlobalBar>
    </Header>
  );
};
