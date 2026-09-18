"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { ToastNotification } from "@carbon/react";

export type ToastKind = "ok" | "warn" | "err" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind, duration?: number) => void;
  ok: (message: string, duration?: number) => void;
  warn: (message: string, duration?: number) => void;
  err: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Carbon's notification kinds, and the title each one carries. Carbon shows a
// title in bold above the body; without one the message sits alone against the
// icon and reads as an unlabelled sentence.
const KIND: Record<ToastKind, { kind: "success" | "warning" | "error" | "info"; title: string }> = {
  ok: { kind: "success", title: "Done" },
  warn: { kind: "warning", title: "Check this" },
  err: { kind: "error", title: "Failed" },
  info: { kind: "info", title: "Note" },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "ok", duration = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [{ id, message, kind }, ...prev]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const ok = useCallback((m: string, d?: number) => toast(m, "ok", d), [toast]);
  const warn = useCallback((m: string, d?: number) => toast(m, "warn", d), [toast]);
  const err = useCallback((m: string, d?: number) => toast(m, "err", d), [toast]);
  const info = useCallback((m: string, d?: number) => toast(m, "info", d), [toast]);

  return (
    <ToastContext.Provider value={{ toast, ok, warn, err, info }}>
      {children}
      {/* aria-live on the host, not on each notification: a region that is
          added to the DOM at the same moment its content arrives is often not
          announced at all. Carbon's own role="status" stays on the card. */}
      <div className="toast-host" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <ToastNotification
            key={t.id}
            kind={KIND[t.kind].kind}
            title={KIND[t.kind].title}
            subtitle={t.message}
            lowContrast
            onClose={() => {
              removeToast(t.id);
              return false;
            }}
            onCloseButtonClick={() => removeToast(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
