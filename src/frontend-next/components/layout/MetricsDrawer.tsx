"use client";

import React, { useState, useEffect } from "react";
import { Button, Tile } from "@carbon/react";
import { Activity, Close } from "@carbon/icons-react";
import { API } from "@/lib/api";
import type { ModelMetrics } from "@/types/grid";

/**
 * A bottom dock rather than a Carbon Modal: these are reference figures an
 * operator wants beside the page they are reading, not instead of it, and a
 * modal would take the focus and dim what they were checking against.
 * Everything inside is Carbon.
 */
export const MetricsDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([API.metrics(), API.stats()])
        .then(([m, s]) => {
          setMetrics(m);
          setStats(s);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Escape closes it, the way any dismissible overlay should.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cards: { label: string; value: React.ReactNode; sub: string }[] = [
    {
      label: "Predictive model",
      value: metrics?.model || "LightGBM classifier",
      sub: `ROC-AUC ${metrics?.roc_auc ?? "—"}`,
    },
    {
      label: "Precision-recall AUC",
      value: metrics?.pr_auc ?? "—",
      sub: `F1 ${metrics?.f1_score ?? "—"}`,
    },
    {
      label: "Telemetry rows processed",
      value: (stats?.telemetry_rows || stats?.total_rows || 0).toLocaleString("en-US"),
      sub: `${metrics?.features_count ?? "—"} engineered features`,
    },
    {
      label: "Inference engine",
      value: "Online",
      sub: "Scored on demand · simulation clock",
    },
  ];

  return (
    <section
      aria-label="Model metrics and system health"
      className="fixed bottom-0 left-0 lg:left-[var(--spacing-rail)] right-0 z-40 bg-panel border-t border-line shadow-overlay max-h-[45vh] overflow-y-auto animate-fade-in rail-anim"
    >
      <div className="px-4 py-2 bg-header border-b border-line flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2">
          <Activity size={16} className="fill-current text-brand-ink" aria-hidden="true" />
          <h2 className="text-micro font-semibold uppercase tracking-wide text-ink">
            Model metrics &amp; system health
          </h2>
        </div>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={Close}
          iconDescription="Close metrics"
          tooltipPosition="left"
          onClick={onClose}
        />
      </div>

      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Tile key={c.label}>
            <div className="text-micro text-ink-3 uppercase font-semibold tracking-wide">
              {c.label}
            </div>
            <div className="mt-1 font-mono text-body font-semibold text-ink">{c.value}</div>
            <div className="mt-0.5 text-micro text-ink-2">{c.sub}</div>
          </Tile>
        ))}
      </div>
    </section>
  );
};
