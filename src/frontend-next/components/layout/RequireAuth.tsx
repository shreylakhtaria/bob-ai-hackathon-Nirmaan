"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { Button, Tag, Tile, InlineLoading } from "@carbon/react";
import { Hourglass, Renew, Logout } from "@carbon/icons-react";

/**
 * Client-side gate for console routes.
 *
 * This is a UX control, not the security boundary — the API rejects every
 * unauthenticated request on its own (see backend/deps.py).
 * If a user is registered but pending admin approval, they see the dedicated
 * Access Pending Approval screen until an administrator approves them.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading, refreshUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // If user is pending approval, poll status periodically
  useEffect(() => {
    if (!isAuthenticated || user?.status !== "pending" || user?.role === "admin") return;
    const interval = setInterval(async () => {
      const updated = await refreshUser();
      if (updated && updated.status === "approved") {
        setStatusMsg("Access approved! Unlocking console...");
      }
    }, 7000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.status, user?.role, refreshUser]);

  const handleManualCheck = async () => {
    setChecking(true);
    setStatusMsg(null);
    try {
      const updated = await refreshUser();
      if (updated && updated.status === "approved") {
        setStatusMsg("Your access request has been approved! Unlocking...");
      } else {
        setStatusMsg("Still pending approval. Please contact the administrator.");
      }
    } catch {
      setStatusMsg("Could not check approval status right now. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (isLoading) return <ScadaSkeletonLoader />;
  if (!isAuthenticated) return null;

  // Gating for users pending operator approval
  if (user?.status === "pending" && user?.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto my-12 font-sans animate-fade-in px-4">
        <Tile className="bg-panel border border-amber-500/30 rounded-xl p-8 shadow-overlay relative overflow-hidden">
          {/* Subtle SCADA Amber Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600" />

          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mb-5 text-amber-500 shadow-inner">
              <Hourglass size={32} className="fill-current animate-pulse" />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Tag type="warm-gray" size="md" className="font-semibold uppercase tracking-wider !bg-amber-500/20 !text-amber-300 border border-amber-500/40">
                Access Request Pending
              </Tag>
              <Tag type="gray" size="md">
                Role: Operator
              </Tag>
            </div>

            <h1 className="text-h2 font-semibold text-ink mt-2">
              Operator Access Pending Approval
            </h1>

            <p className="text-h4 text-amber-400/90 font-medium mt-1">
              You haven&apos;t yet received access. Contact the admin.
            </p>

            <p className="text-label text-ink-3 max-w-lg mt-3 leading-relaxed">
              Your registration request has been submitted to the Grid Risk Advisor review board.
              To protect mission-critical grid telemetry and dispatch controls, an administrator
              must verify your identity and approve your account before operational access is granted.
            </p>

            {/* Account Details Panel */}
            <div className="w-full bg-sunken/60 border border-line rounded-lg p-4 mt-6 text-left space-y-2.5">
              <div className="flex items-center justify-between text-micro text-ink-3 border-b border-line pb-2">
                <span className="font-medium uppercase tracking-wide">Account Identity</span>
                <span className="font-mono text-ink-2">{user.email}</span>
              </div>
              <div className="flex items-center justify-between text-micro text-ink-3 border-b border-line pb-2">
                <span className="font-medium uppercase tracking-wide">Display Name</span>
                <span className="text-ink">{user.display_name || "Operator Candidate"}</span>
              </div>
              <div className="flex items-center justify-between text-micro text-ink-3 border-b border-line pb-2">
                <span className="font-medium uppercase tracking-wide">Target Role</span>
                <span className="text-brand-ink font-semibold">Grid Operator</span>
              </div>
              <div className="flex items-center justify-between text-micro text-ink-3">
                <span className="font-medium uppercase tracking-wide">Verification Queue</span>
                <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                  Queued in Admin Console &gt; Access Requests
                </span>
              </div>
            </div>

            {statusMsg && (
              <div className="w-full mt-4 p-3 rounded-lg bg-surface border border-line text-label text-ink font-mono text-center animate-fade-in">
                {statusMsg}
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 w-full">
              <Button
                kind="primary"
                size="md"
                renderIcon={Renew}
                disabled={checking}
                onClick={handleManualCheck}
                className="min-w-[180px]"
              >
                {checking ? <InlineLoading description="Checking status…" /> : "Check Approval Status"}
              </Button>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={Logout}
                onClick={handleLogout}
              >
                Sign Out
              </Button>
            </div>

            <div className="mt-6 flex items-center gap-2 text-micro text-ink-3">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Real-time listener active — this view will automatically unlock once approved.</span>
            </div>
          </div>
        </Tile>
      </div>
    );
  }

  return <>{children}</>;
};
