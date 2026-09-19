"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { Events, Identification, Time, UserRole } from "@carbon/icons-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Operator profile — read-only.
 *
 * This page previously offered editable Name / Title / Department / Phone
 * fields and a password-change form, wired to `API.updateProfile` and to
 * `setUser` / `refreshUser` on the auth context. None of those exist: the
 * backend has no profile endpoint, `users` has no title/department/phone
 * column, and the context exposes neither setter. The page therefore did not
 * compile, which broke the whole frontend build.
 *
 * Rather than invent a half-feature or — worse — ship inputs that accept
 * typing and silently discard it, this shows only what the server actually
 * stores about the signed-in operator. Restoring editing means adding the
 * backend first: a profile update endpoint, the columns to back it, and a
 * password-change flow that verifies the current password.
 */
export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="text-label text-ink-3">Loading profile…</div>;
  }

  if (!user) {
    return <div className="text-label text-ink-3">Not signed in.</div>;
  }

  const fields: { icon: React.ReactNode; label: string; value: string }[] = [
    {
      icon: <Identification size={16} className="fill-current text-ink-3" aria-hidden="true" />,
      label: "Operator name",
      value: user.display_name || user.email.split("@")[0],
    },
    {
      icon: <Events size={16} className="fill-current text-ink-3" aria-hidden="true" />,
      label: "Work email",
      value: user.email,
    },
    {
      icon: <Time size={16} className="fill-current text-ink-3" aria-hidden="true" />,
      label: "Account created",
      value: user.created_at
        ? new Date(user.created_at).toLocaleString("en-GB", { hour12: false })
        : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      <div className="pb-2 border-b border-line">
        <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
          <span>Account</span>
          <span className="text-line">/</span>
          <span className="text-brand-ink font-bold">Operator Profile</span>
        </div>
        <h1 className="text-title font-bold text-ink tracking-tight">Operator Profile</h1>
        <p className="text-label text-ink-2">
          Your account as the server has it. Roles are assigned server-side and cannot be
          changed from this console.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        <Tile className="lg:col-span-2">
          <h2 className="text-label font-semibold text-ink mb-3">Account details</h2>
          <dl className="space-y-3">
            {fields.map((f) => (
              <div key={f.label} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">{f.icon}</span>
                <div className="min-w-0">
                  <dt className="text-micro uppercase tracking-wide text-ink-3">{f.label}</dt>
                  <dd className="text-body text-ink font-medium break-all">{f.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Tile>

        <Tile>
          <h2 className="text-label font-semibold text-ink mb-3">Access level</h2>
          <div className="flex items-center gap-2">
            <UserRole size={16} className="fill-current text-ink-3" aria-hidden="true" />
            {/* The role is derived from the signed access token on every
                request; this is a display of it, never a control over it. */}
            <Tag type={user.role === "admin" ? "red" : "green"} size="md">
              {user.role}
            </Tag>
          </div>
          <p className="mt-3 text-micro text-ink-3 leading-relaxed">
            {user.role === "admin"
              ? "Full access, including the security audit trail and user administration."
              : "Operational control: dispatch, scheduling, simulation and data import."}
          </p>
        </Tile>
      </div>

      <p className="text-micro text-ink-3">
        Editing name, contact details and passwords is not available yet — it needs a
        profile endpoint and the columns to back it, neither of which exists on the
        server today.
      </p>
    </div>
  );
}
