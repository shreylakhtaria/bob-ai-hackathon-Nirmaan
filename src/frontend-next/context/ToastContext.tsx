"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Check, Info, AlertTriangle, X } from "lucide-react";

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

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "ok", duration = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage = { id, message, kind };
      setToasts((prev) => [newToast, ...prev]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
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
      {/* Top-Centered Floating Toast Container matching Image 1 */}
      <div className="toast-host">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-card ${
              t.kind === "ok" ? "toast-ok" : t.kind === "err" ? "toast-err" : "toast-warn"
            }`}
            role="alert"
          >
            <div className={`toast-circle-icon ${t.kind}`}>
              {t.kind === "ok" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              {t.kind === "err" && <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />}
              {(t.kind === "warn" || t.kind === "info") && <Info className="w-3.5 h-3.5 stroke-[2.5]" />}
            </div>
            <div className="flex-1 leading-snug text-[#0b1c30] text-[13.5px] font-medium tracking-tight">
              {t.message}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-[#707971] hover:text-[#0b1c30] p-1 rounded hover:bg-[#eff4ff] transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
