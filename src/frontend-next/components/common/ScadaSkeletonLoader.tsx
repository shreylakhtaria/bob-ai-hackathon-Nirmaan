"use client";

import React from "react";
import { Tile } from "@carbon/react";

/**
 * A custom power-grid themed loader that replaces the generic skeleton loader.
 * It renders a spinning/pulsing power node animation to fit the SCADA industrial theme.
 */
export const ScadaSkeletonLoader = () => {
  return (
    <>
      <style>{`
        .grid-loader-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          width: 100%;
        }
        
        .power-node {
          position: relative;
          width: 80px;
          height: 80px;
        }
        
        .power-node-core {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 24px;
          height: 24px;
          background-color: #0f5132;
          border-radius: 50%;
          box-shadow: 0 0 15px 5px rgba(15, 81, 50, 0.4);
          animation: pulse 1.5s ease-in-out infinite alternate;
          z-index: 2;
        }
        
        .power-node-ring {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: 3px solid transparent;
          border-top-color: #0f5132;
          border-bottom-color: #0f5132;
          border-radius: 50%;
          animation: spin 2s linear infinite;
        }

        .power-node-ring.inner {
          top: 10px;
          left: 10px;
          width: calc(100% - 20px);
          height: calc(100% - 20px);
          border-top-color: transparent;
          border-bottom-color: transparent;
          border-left-color: #95d4ac;
          border-right-color: #95d4ac;
          animation: spin-reverse 1.5s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes spin-reverse {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.8; box-shadow: 0 0 10px 2px rgba(15, 81, 50, 0.3); }
          100% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; box-shadow: 0 0 20px 8px rgba(15, 81, 50, 0.6); }
        }
      `}</style>
      
      <div className="grid-loader-container">
        <div className="power-node mb-6">
          <div className="power-node-ring" />
          <div className="power-node-ring inner" />
          <div className="power-node-core" />
        </div>
        <div className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-[#0f5132] animate-pulse">
          Establishing Grid Connection...
        </div>
        <div className="text-xs font-mono text-ink-4 mt-2 tracking-wider">
          Connecting to substation telemetry
        </div>
      </div>
    </>
  );
};
