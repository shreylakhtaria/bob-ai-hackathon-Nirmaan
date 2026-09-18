"use client";

import React from "react";
import { X, Activity } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface SensorChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  value: string | number;
  unit: string;
  status: string;
  threshold: string;
  trend?: number[];
}

export const SensorChartModal: React.FC<SensorChartModalProps> = ({
  isOpen,
  onClose,
  label,
  value,
  unit,
  status,
  threshold,
  trend,
}) => {
  if (!isOpen) return null;

  // Use real telemetry trend if provided, otherwise fallback to base value (should not happen in prod)
  const base = parseFloat(String(value)) || 50;
  let dataPoints = trend || [];
  
  if (dataPoints.length === 0) {
    dataPoints = Array.from({ length: 24 }).map(() => base);
  }

  // Generate labels based on the number of data points
  const labels = Array.from({ length: dataPoints.length }, (_, i) => `${dataPoints.length - i}h ago`).reverse();

  const chartData = {
    labels,
    datasets: [
      {
        label: `${label} (${unit})`,
        data: dataPoints,
        borderColor: status.toUpperCase().includes("CRIT") ? "#ba1a1a" : "#0f5132",
        backgroundColor: "rgba(15, 81, 50, 0.08)",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y} ${unit}`,
        },
      },
    },
    scales: {
      x: { grid: { color: "rgba(192, 201, 192, 0.3)" } },
      y: { grid: { color: "rgba(192, 201, 192, 0.3)" } },
    },
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-xl shadow-2xl border border-[#c0c9c0] w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-[#dce9ff] border-b border-[#c0c9c0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#003820]" />
            <div>
              <h3 className="text-[14px] font-bold text-[#0b1c30] uppercase font-mono">
                {label} Telemetry &mdash; 24h Trend
              </h3>
              <span className="text-[11px] text-[#404942] font-mono">
                Current: {value} {unit} &bull; Threshold: {threshold}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#e5eeff] text-[#0b1c30]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex-1">
          <div className="h-64 w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#f8f9ff] border-t border-[#c0c9c0]/50 flex items-center justify-between font-mono text-[11px] text-[#404942]">
          <span>Sampling: 1-minute SCADA poll</span>
          <span className="text-[#003820] font-bold">Status: {status}</span>
        </div>
      </div>
    </div>
  );
};
