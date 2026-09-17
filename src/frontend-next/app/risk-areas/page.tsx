"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Shield, CloudRain, AlertTriangle, ChevronRight, RotateCw } from "lucide-react";
import { RiskBadge } from "@/components/common/RiskBadge";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import { WeatherChart } from "@/components/sensors/WeatherChart";

export default function RiskAreasPage() {
  const router = useRouter();

  const { data: areas = [], isLoading, refetch: refetchAreas } = useQuery({
    queryKey: ["risk-areas-list"],
    queryFn: () => API.areas(),
  });

  const { data: wxData = {} } = useQuery({
    queryKey: ["weather-data"],
    queryFn: async () => {
      const wxArray = await API.weather();
      // the api returns an array of weather data? Wait, in main frontend we saw `wx[a.area_id]`. Let's assume API.weather() returns a dict, but if it's an array we should map it.
      // Wait, in main API.weather() might return a dict. Let's just return the raw response for now.
      return Array.isArray(wxArray) ? Object.fromEntries(wxArray.map(w => [w.area_id, w])) : wxArray;
    },
  });

  const worstArea = [...areas].sort((a, b) => (b.weather_risk || 0) - (a.weather_risk || 0))[0];

  const { data: weatherSeries = [] } = useQuery({
    queryKey: ["weather-series", worstArea?.area_id],
    queryFn: () => API.weatherSeries(worstArea?.area_id || "", 96),
    enabled: !!worstArea?.area_id,
  });

  if (isLoading) {
    return <ScadaSkeletonLoader />;
  }

  const handleRefetch = () => {
    refetchAreas();
  };

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#c0c9c0]/60">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Spatial Diagnostics</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">Regional Risk Exposure</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#0b1c30] tracking-tight font-sans">
            Regional Grid Risk &amp; Weather Exposure Matrix
          </h1>
          <p className="text-[12.5px] text-[#404942]">
            Area-level outage probabilities, storm vulnerability indexes, and customer exposure zones.
          </p>
        </div>
        <button
          onClick={handleRefetch}
          className="h-8 px-3.5 bg-white text-[#0b1c30] border border-[#c0c9c0] rounded-md font-mono text-[11px] font-bold hover:bg-[#eff4ff] transition-colors flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#003820]" /> Refresh Matrix
        </button>
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 mb-2">
        <div className="lg:col-span-12">
          <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#dce9ff] flex items-center gap-2 border-b border-[#c0c9c0]/50">
              <CloudRain className="w-4 h-4 text-[#003820]" />
              <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
                Weather Forecast — Worst Area ({worstArea?.area_id || "N/A"}) (96h)
              </span>
            </div>
            <div className="p-3.5 h-[280px]">
              <WeatherChart data={weatherSeries} />
            </div>
          </div>
        </div>
      </div>

      {/* Areas Table */}
      <div className="bg-white rounded-lg shadow-sm border border-[#c0c9c0]/60 overflow-hidden">
        <div className="px-3.5 py-2.5 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#003820]" />
            <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase">
              Operational Region Matrix ({areas.length} Geographic Zones)
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#707971]">Live SCADA &amp; Weather Synthesis</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-[12.5px]">
            <thead>
              <tr className="bg-[#eff4ff] text-[#404942] font-mono text-[10px] uppercase tracking-wider border-b border-[#c0c9c0]/40">
                <th className="py-2.5 px-3">Area / Node</th>
                <th className="py-2.5 px-3">Risk Tier</th>
                <th className="py-2.5 px-3">Outage Prob.</th>
                <th className="py-2.5 px-3">Weather Score</th>
                <th className="py-2.5 px-3 text-right">High-Risk Assets</th>
                <th className="py-2.5 px-3 text-right">Customers Exposed</th>
                <th className="py-2.5 px-3">Primary Risk Stressor</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff4ff]">
              {areas.map((area) => (
                <tr
                  key={area.area_id}
                  onClick={() => router.push(`/assets?q=${area.area_id}`)}
                  className="hover:bg-[#eff4ff] cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-[#003820]">
                    {area.area_id}
                  </td>
                  <td className="py-2.5 px-3">
                    <RiskBadge level={area.risk_level} />
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-[#ba1a1a]">
                    {F.pct(area.outage_probability)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#404942]">
                      <CloudRain className="w-3.5 h-3.5 text-[#0f5132]" />
                      <div className="flex flex-col">
                        <span>{area.weather_risk} / 100</span>
                        {wxData[area.area_id] && (
                          <span className="text-[9px] text-[#707971]">
                            {Math.round(wxData[area.area_id].wind_speed || 0)} km/h {wxData[area.area_id].storm ? '⚡' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#ba1a1a]">
                    {area.high_risk_assets}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                    {F.num(area.customers_exposed)}
                  </td>
                  <td className="py-2.5 px-3 text-[11.5px] text-[#404942]">
                    {area.primary_driver || "Elevated equipment thermal load"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/simulation?tab=weather&area=${area.area_id}`);
                      }}
                      className="px-2 py-0.5 bg-[#eff4ff] text-[#003820] font-mono text-[10px] font-bold rounded border border-[#c0c9c0] hover:bg-[#dce9ff]"
                    >
                      Simulate &rsaquo;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
