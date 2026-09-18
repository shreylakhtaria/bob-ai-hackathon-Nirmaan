"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";

const GridMapClient = dynamic(
  () => import("@/components/map/GridMapClient").then((mod) => mod.GridMapClient),
  {
    ssr: false,
    loading: () => <ScadaSkeletonLoader />,
  }
);

export default function GridMapPage() {
  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Spatial Telemetry</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Interactive Grid Map</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Regional Grid GIS &amp; Weather Geospatial Map
          </h1>
        </div>
      </div>

      <GridMapClient />
    </div>
  );
}
