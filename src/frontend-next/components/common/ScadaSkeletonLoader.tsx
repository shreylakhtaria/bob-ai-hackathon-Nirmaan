import React from "react";
import { CheckCircle2, RotateCw, Hourglass, Activity, ShieldAlert, Video } from "lucide-react";

export const ScadaSkeletonLoader: React.FC = () => {
  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in p-1">
      {/* Ingestion Pipeline Stage Banner */}
      <div className="bg-white border border-[#c0c9c0]/60 rounded-lg p-3.5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2.5 border-b border-[#c0c9c0]/40">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-[#baeed9] text-[#002117] px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0f5132] animate-pulse" />
              STAGE 3/4 ACTIVE
            </span>
            <span className="font-mono text-[12px] font-bold text-[#0b1c30] uppercase tracking-tight">
              Telemetry Ingestion &amp; Contingency Inference Engine
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-[#404942]">
            <span className="text-[#003820] font-bold">88.2% INITIALIZED</span>
            <span>ELAPSED: 0.88s &bull; EST REMAINING: 0.22s</span>
          </div>
        </div>

        {/* 4 Pipeline Stage Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-2.5">
          <div className="flex items-center gap-2 p-1.5 bg-[#eff4ff] rounded border border-[#c0c9c0]/40">
            <CheckCircle2 className="w-4 h-4 text-[#0f5132]" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] font-bold text-[#0b1c30] truncate">1. SCADA Gateway</div>
              <div className="font-mono text-[9px] text-[#707971]">TLS 1.3 [12ms]</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-[#eff4ff] rounded border border-[#c0c9c0]/40">
            <CheckCircle2 className="w-4 h-4 text-[#0f5132]" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] font-bold text-[#0b1c30] truncate">2. Synchrophasor</div>
              <div className="font-mono text-[9px] text-[#707971]">IEEE C37.118 [4.8kHz]</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-[#0f5132] text-white rounded border border-[#0f5132]/50">
            <RotateCw className="w-4 h-4 text-white animate-spin" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] font-bold truncate">3. DGA Telemetry</div>
              <div className="font-mono text-[9px] opacity-90">1,194/1,420 (84%)</div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-[#e5eeff] rounded border border-[#c0c9c0]/40 opacity-70">
            <Hourglass className="w-4 h-4 text-[#707971]" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] font-bold text-[#707971] truncate">4. XGBoost Ingest</div>
              <div className="font-mono text-[9px] text-[#707971]">v4.2.1 [QUEUED]</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Shimmer Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-[#c0c9c0]/50 p-3.5 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 sk-shimmer rounded" />
              <div className="w-4 h-4 sk-shimmer rounded-full" />
            </div>
            <div className="h-6 w-28 sk-shimmer-dark rounded" />
            <div className="h-2.5 w-36 sk-shimmer rounded" />
          </div>
        ))}
      </div>

      {/* Main 12-column Skeleton Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left: Telemetry Live Stream & DGA Curve (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#376757] animate-ping" />
                <span className="font-mono text-[11px] font-bold text-[#0b1c30] uppercase">
                  Critical Telemetry Live Stream
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#0f5132] font-bold">SYNCING 4.8 KHZ</span>
            </div>
            <div className="p-3.5 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5 border-b border-[#eff4ff] last:border-0"
                >
                  <div className="flex items-center gap-2 w-1/4">
                    <span className={`w-2 h-2 rounded-full ${i <= 2 ? "bg-[#ba1a1a] animate-pulse" : "bg-[#707971]"}`} />
                    <div className="h-3.5 w-16 sk-shimmer-dark rounded" />
                  </div>
                  <div className="h-3.5 w-24 sk-shimmer rounded" />
                  <div className="h-3.5 w-14 sk-shimmer rounded" />
                  <div className="h-3 w-16 sk-shimmer rounded-full" />
                  <div className="h-5 w-12 sk-shimmer rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#0f5132]" />
                <span className="font-mono text-[11px] font-bold uppercase text-[#0b1c30]">
                  Substation DGA &amp; Thermal Runaway Telemetry Curve
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#707971]">REAL-TIME HISTORIAN BUFFER</span>
            </div>
            <div className="h-36 w-full bg-[#eff4ff] rounded-lg p-2 relative overflow-hidden flex items-end">
              <svg className="w-full h-28" viewBox="0 0 500 120" preserveAspectRatio="none">
                <line x1="0" x2="500" y1="40" y2="40" stroke="#ba1a1a" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
                <path d="M0,90 Q80,105 160,85 T320,95 T440,35 L500,28" fill="none" stroke="#0f5132" strokeWidth="2.5" className="animate-pulse" />
                <circle cx="440" cy="35" r="4" fill="#ba1a1a" className="animate-ping" />
                <circle cx="440" cy="35" r="3" fill="#ba1a1a" />
              </svg>
            </div>
            <div className="flex items-center justify-between mt-2 font-mono text-[10px] text-[#707971]">
              <span>T - 180 MIN</span>
              <span>T - 120 MIN</span>
              <span>T - 60 MIN</span>
              <span className="text-[#ba1a1a] font-bold">LIVE TELEMETRY (0s)</span>
            </div>
          </div>
        </div>

        {/* Right: Feeder Risk, Alarm Feed & Optical Cam (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#c0c9c0]/40">
              <span className="font-mono text-[11px] font-bold uppercase text-[#0b1c30]">Feeder Risk Exposure</span>
              <span className="font-mono text-[10px] text-[#707971]">REGION-RC4</span>
            </div>
            <div className="space-y-2.5">
              <div className="h-4 w-full sk-shimmer rounded" />
              <div className="h-4 w-5/6 sk-shimmer rounded" />
              <div className="h-4 w-4/6 sk-shimmer rounded" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#c0c9c0]/40">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-[#ba1a1a]" />
                <span className="font-mono text-[11px] font-bold uppercase text-[#0b1c30]">High-Priority Alarm Feed</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="p-2 bg-[#ffdad6]/40 border border-[#ba1a1a]/30 rounded flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#ba1a1a] font-bold">&bull; PRIORITY 1 ALARM</span>
                <span className="font-mono text-[9px] text-[#707971]">LIVE INGESTION</span>
              </div>
              <div className="p-2 bg-[#eff4ff] border border-[#c0c9c0]/40 rounded flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#376757] font-bold">&bull; WARNING L2</span>
                <span className="font-mono text-[9px] text-[#707971]">SYNCHRONIZED</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#c0c9c0]/50 shadow-sm p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Video className="w-4 h-4 text-[#0f5132]" />
                <span className="font-mono text-[11px] font-bold uppercase text-[#0b1c30]">Substation Optical Feed</span>
              </div>
              <span className="font-mono text-[10px] text-[#ba1a1a] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a] animate-ping" />
                LIVE SCADA CAM
              </span>
            </div>
            <div className="h-28 bg-[#eff4ff] rounded-lg flex flex-col items-center justify-center gap-1 border border-[#c0c9c0]/40 text-[#707971]">
              <Activity className="w-6 h-6 text-[#0f5132] animate-pulse" />
              <span className="font-mono text-[10px] tracking-wider uppercase">Awaiting H.264 Keyframe…</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
