"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RiskBadge } from "@/components/common/RiskBadge";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { API } from "@/lib/api";
import { F } from "@/lib/utils";
import { WeatherChart } from "@/components/sensors/WeatherChart";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { ArrowRight, Rain, Renew, Security } from "@carbon/icons-react";

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Spatial Diagnostics</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Regional Risk Exposure</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            Regional Grid Risk &amp; Weather Exposure Matrix
          </h1>
          <p className="text-label text-ink-2">
            Area-level outage probabilities, storm vulnerability indexes, and customer exposure zones.
          </p>
        </div>
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Renew}
          onClick={handleRefetch}
          className="self-start md:self-auto"
        >
          Refresh matrix
        </Button>
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 mb-2">
        <div className="lg:col-span-12">
          <div className="bg-panel rounded-xl shadow-panel border border-line overflow-hidden">
            <div className="px-3.5 py-2.5 bg-header flex items-center gap-2 border-b border-line">
              <Rain size={16} className="fill-current text-brand-ink" />
              <span className="text-micro font-semibold text-ink uppercase">
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
      <div className="bg-panel rounded-xl shadow-panel border border-line overflow-hidden">
        <div className="px-3.5 py-2.5 bg-header flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-2">
            <Security size={16} className="fill-current text-brand-ink" />
            <span className="text-micro font-semibold text-ink uppercase">
              Operational Region Matrix ({areas.length} Geographic Zones)
            </span>
          </div>
          <span className="font-mono text-micro text-ink-3">Live SCADA &amp; Weather Synthesis</span>
        </div>

        <div className="overflow-x-auto">
          <Table size="sm" useZebraStyles={false}>
            <TableHead>
              <TableRow className="text-micro">
                <TableHeader>Area / Node</TableHeader>
                <TableHeader>Risk Tier</TableHeader>
                <TableHeader>Outage Prob.</TableHeader>
                <TableHeader>Weather Score</TableHeader>
                <TableHeader className="text-right">High-Risk Assets</TableHeader>
                <TableHeader className="text-right">Customers Exposed</TableHeader>
                <TableHeader>Primary Risk Stressor</TableHeader>
                <TableHeader className="text-right">Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {areas.map((area) => (
                <TableRow
                  key={area.area_id}
                  onClick={() => router.push(`/assets?q=${area.area_id}`)}
                  className="hover:bg-sunken cursor-pointer transition-colors"
                >
                  <TableCell className="font-mono font-bold text-brand-ink">
                    {area.area_id}
                  </TableCell>
                  <TableCell>
                    <RiskBadge level={area.risk_level} />
                  </TableCell>
                  <TableCell className="font-mono font-bold text-sev-critical">
                    {F.pct(area.outage_probability)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-micro text-ink-2">
                      <Rain size={14} className="fill-current text-brand" />
                      <div className="flex flex-col">
                        <span>{area.weather_risk} / 100</span>
                        {wxData[area.area_id] && (
                          <span className="text-micro text-ink-3">
                            {Math.round(wxData[area.area_id].wind_speed || 0)} km/h {wxData[area.area_id].storm ? '⚡' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-sev-critical">
                    {area.high_risk_assets}
                  </TableCell>
                  <TableCell className="text-right font-mono text-micro">
                    {F.num(area.customers_exposed)}
                  </TableCell>
                  <TableCell className="text-micro">
                    {area.primary_driver || "Elevated equipment thermal load"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={ArrowRight}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        router.push(`/simulation?tab=weather&area=${area.area_id}`);
                      }}
                    >
                      Simulate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
