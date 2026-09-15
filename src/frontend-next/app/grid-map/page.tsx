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
      <div className="flex items-center justify-between pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Spatial Telemetry</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Interactive Grid Map</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Regional Grid GIS &amp; Weather Geospatial Map
          </h1>
        </div>
      </div>

      <GridMapClient />
    </div>
  );
}
