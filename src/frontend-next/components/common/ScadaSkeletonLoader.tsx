"use client";

import React from "react";
import { Activity } from "lucide-react";

export const ScadaSkeletonLoader = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-in space-y-4">
      <div className="relative flex items-center justify-center w-16 h-16">
        <div className="absolute inset-0 border-4 border-[#eff4ff] rounded-full"></div>
        <div className="absolute inset-0 border-4 border-[#003820] rounded-full border-t-transparent animate-spin"></div>
        <Activity className="w-6 h-6 text-[#003820] animate-pulse" />
      </div>
      <div className="font-mono text-[13px] font-bold text-[#003820] uppercase tracking-widest animate-pulse">
        Initializing...
      </div>
    </div>
  );
};
