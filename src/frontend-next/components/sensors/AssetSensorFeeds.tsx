"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { API } from "@/lib/api";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip);

interface AssetSensorFeedsProps {
  assetId: string;
  sensorsSummary: Record<string, any>;
  onSensorClick: (sensor: any) => void;
}

export const AssetSensorFeeds: React.FC<AssetSensorFeedsProps> = ({ assetId, sensorsSummary, onSensorClick }) => {
  const [hours, setHours] = useState(24);

  const { data, isLoading } = useQuery({
    queryKey: ["sensors", assetId, hours],
    queryFn: () => API.sensors(assetId, hours),
    enabled: !!assetId,
  });

  const sensors: any[] = Array.isArray(data) ? data : [];

  const RANGES = [
    { label: "1h", value: 1 },
    { label: "6h", value: 6 },
    { label: "24h", value: 24 },
    { label: "7d", value: 168 },
  ];

  const metrics = [
    { title: "TOP-OIL TEMP", key: "oil_temperature", unit: "°C", dec: 1 },
    { title: "WINDING TEMP", key: "temperature", unit: "°C", dec: 1 },
    { title: "VIBRATION RMS", key: "vibration", unit: " mm/s", dec: 2 },
    { title: "PARTIAL DISCHARGE", key: "partial_discharge", unit: " pC", dec: 0 },
    { title: "OIL QUALITY INDEX", key: "oil_quality", unit: "", dec: 1 },
    { title: "LOAD", key: "load_percentage", unit: "%", dec: 1 },
  ];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-brand-ink" />
          <span className="font-bold text-ink text-lede">Real-Time Sensor Feeds</span>
        </div>
        <div className="inline-flex bg-sunken rounded p-0.5 font-mono text-micro text-ink-2">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setHours(r.value)}
              className={`px-1.5 py-0.5 rounded transition-all ${
                hours === r.value ? "bg-header text-ink font-bold shadow-panel" : "hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center font-mono text-micro text-ink-3">
          Loading telemetry...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => {
            const vals = sensors.map((s: any) => parseFloat(s[m.key]) || 0);
            const validVals = vals.filter((v: number) => !isNaN(v));
            const latest = validVals.length ? validVals[validVals.length - 1] : 0;
            const earliest = validVals.length ? validVals[0] : 0;
            const diff = latest - earliest;
            const pct = earliest ? (diff / earliest) * 100 : 0;
            
            const min = validVals.length ? Math.min(...validVals) : 0;
            const max = validVals.length ? Math.max(...validVals) : 0;

            const summary = sensorsSummary[m.key] || {};
            const isUp = pct > 0;
            const statusStr = (summary.status || 'NORMAL').toUpperCase();
            const isAlert = !['NOMINAL', 'NORMAL'].includes(statusStr);
            const color = summary.color || (isAlert ? "#ba1a1a" : "#0f5132");

            const data = {
              labels: sensors.map((_: any, i: number) => i),
              datasets: [
                {
                  data: vals,
                  borderColor: color,
                  borderWidth: 2,
                  pointRadius: 0,
                  tension: 0.3,
                },
              ],
            };

            const options = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: {
                x: { display: false },
                y: { display: false },
              },
            };

            return (
              <div 
                key={m.key} 
                onClick={() => onSensorClick({ 
                  label: summary.label || m.title,
                  latest: latest,
                  unit: m.unit,
                  status: summary.status || (isAlert ? "CRITICAL" : "NORMAL"),
                  threshold: summary.threshold || "--",
                  trend: vals 
                })}
                className="bg-sunken border border-line rounded-lg p-2.5 shadow-panel hover:border-brand cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="text-micro uppercase font-semibold text-ink-2 tracking-wider">
                      {m.title}
                    </div>
                    <div className="font-mono text-micro text-ink-3">
                      {hours}h range {min.toFixed(m.dec)}-{max.toFixed(m.dec)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-body font-bold" style={{ color }}>
                      {latest.toFixed(m.dec)}
                      <span className="text-micro ml-0.5">{m.unit}</span>
                    </div>
                    <div className="font-mono text-micro font-bold" style={{ color }}>
                      {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="h-12 w-full mt-2">
                  <Line data={data} options={options} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 font-mono text-micro text-ink-3">
        {sensors.length} telemetry samples &middot; GET /api/assets/{assetId}/sensors?hours={hours}
      </div>
    </div>
  );
};
