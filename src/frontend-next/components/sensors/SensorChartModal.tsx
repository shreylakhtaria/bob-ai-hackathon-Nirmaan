"use client";

import React from "react";
import { Modal, Tag } from "@carbon/react";
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
    /* A Carbon Modal: it traps focus, restores it on close, closes on Escape
       and labels itself — all of which the hand-rolled overlay this replaced
       did none of. `passiveModal` because reading a chart has no action to
       confirm. */
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      modalHeading={`${label} telemetry — 24h trend`}
      modalLabel={`Current ${value} ${unit} · threshold ${threshold}`}
      passiveModal
      size="lg"
      aria-label={`${label} telemetry chart`}
    >
      <div className="h-64 w-full">
        <Line data={chartData} options={chartOptions} />
      </div>
      <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-3 font-mono text-micro text-ink-2">
        <span>Sampling: 1-minute SCADA poll</span>
        <Tag type={status.toUpperCase().includes("CRIT") ? "red" : "green"} size="sm">
          {status}
        </Tag>
      </div>
    </Modal>
  );
};
