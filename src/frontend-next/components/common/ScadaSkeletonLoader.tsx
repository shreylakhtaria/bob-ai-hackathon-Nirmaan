"use client";

import React from "react";
import { SkeletonPlaceholder, SkeletonText, Tile } from "@carbon/react";

/**
 * A structural skeleton rather than a spinner. A spinner says only "wait"; this
 * shows the shape of the screen that is arriving, so the layout does not jump
 * when it lands and the wait reads as progress.
 *
 * Built from Carbon's skeleton primitives, which carry the shimmer, the
 * reduced-motion opt-out and `aria-hidden` on each placeholder — the status
 * message below is the only thing a screen reader should hear.
 */
export const ScadaSkeletonLoader = () => {
  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in" role="status" aria-live="polite">
      <span className="sr-only">Loading grid data</span>

      <div className="flex items-end justify-between gap-4 pb-3 border-b border-line">
        <div className="w-64">
          <SkeletonText width="40%" />
          <SkeletonText heading width="90%" />
        </div>
        <SkeletonPlaceholder className="!h-9 !w-32" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Tile key={i}>
            <SkeletonText width="60%" />
            <SkeletonText heading width="45%" />
            <SkeletonText width="100%" />
          </Tile>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Tile className="lg:col-span-2">
          <SkeletonText width="45%" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 mb-2">
              <SkeletonPlaceholder className="!h-8 !w-8 shrink-0" />
              <div className="flex-1">
                <SkeletonText width="35%" />
                <SkeletonText width="65%" />
              </div>
            </div>
          ))}
        </Tile>
        <Tile>
          <SkeletonText width="55%" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-2">
              <SkeletonText width="50%" />
              <SkeletonText width="100%" />
            </div>
          ))}
        </Tile>
      </div>
    </div>
  );
};
