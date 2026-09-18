"use client";

import React from "react";
import { Tile } from "@carbon/react";

interface PanelCardProps {
  title: string;
  icon?: React.ReactNode;
  /** Optional one-line explanation under the title. A panel that needs a
   *  caption should carry it here rather than in the body. */
  hint?: string;
  extraHeader?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Drop the body padding when the panel holds a full-bleed table or map. */
  flush?: boolean;
}

/**
 * A titled Carbon Tile.
 *
 * Carbon has no "panel with a header strip" component — TileGroup is for
 * selection and ExpandableTile for progressive disclosure — so the header is
 * ours and the surface is Carbon's. `!p-0` because the header has to run to
 * the tile's edge to read as a strip.
 */
export const PanelCard: React.FC<PanelCardProps> = ({
  title,
  icon,
  hint,
  extraHeader,
  children,
  className = "",
  flush = false,
}) => {
  return (
    <Tile className={`overflow-hidden !p-0 ${className}`}>
      <header className="px-4 py-2.5 border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="text-ink-3 shrink-0" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-label font-semibold text-ink tracking-tight truncate">{title}</h2>
            {hint && <p className="text-micro text-ink-3 truncate">{hint}</p>}
          </div>
        </div>
        {extraHeader && <div className="shrink-0">{extraHeader}</div>}
      </header>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </Tile>
  );
};
