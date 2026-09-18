"use client";

import React from "react";

/**
 * A structural skeleton rather than a spinner. A spinner says only "wait"; this
 * shows the shape of the screen that is arriving, so the layout does not jump
 * when it lands and the wait reads as progress.
 */
export const ScadaSkeletonLoader = () => {
  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in" role="status" aria-live="polite">
      <span className="sr-only">Loading grid data</span>

      <div className="flex items-end justify-between gap-4 pb-3 border-b border-line">
        <div className="space-y-2">
          <div className="sk-shimmer h-3 w-28" />
          <div className="sk-shimmer-dark h-6 w-64" />
        </div>
        <div className="sk-shimmer h-9 w-32" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-panel rounded-xl border border-line p-4 space-y-3">
            <div className="sk-shimmer h-3 w-20" />
            <div className="sk-shimmer-dark h-7 w-16" />
            <div className="sk-shimmer h-1 w-full" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-panel rounded-xl border border-line p-4 space-y-3">
          <div className="sk-shimmer h-3 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="sk-shimmer-dark h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="sk-shimmer h-3 w-1/3" />
                <div className="sk-shimmer h-1.5 w-2/3" />
              </div>
              <div className="sk-shimmer h-5 w-16 rounded-full shrink-0" />
            </div>
          ))}
        </div>
        <div className="bg-panel rounded-xl border border-line p-4 space-y-3">
          <div className="sk-shimmer h-3 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="sk-shimmer h-3 w-1/2" />
              <div className="sk-shimmer h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
