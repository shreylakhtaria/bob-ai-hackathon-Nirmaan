"use client";

import React from "react";
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

interface WeatherChartProps {
  data: any[];
}

export const WeatherChart: React.FC<WeatherChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="h-full flex items-center justify-center text-[12px] text-[#707971] font-mono">No weather data available</div>;
  }

  const reversed = [...data].reverse();
  const labels = reversed.map((d: any) => {
    const date = new Date(d.timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: "Extreme Weather Score",
        data: reversed.map((d) => d.extreme_weather_score),
        borderColor: "#ba1a1a",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
      },
      {
        label: "Wind km/h",
        data: reversed.map((d) => d.wind_speed),
        borderColor: "#376757",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
      },
      {
        label: "Rainfall mm",
        data: reversed.map((d) => d.rainfall),
        borderColor: "#0f5132",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" as const, labels: { font: { family: "monospace", size: 10 } } },
      tooltip: { mode: "index" as const, intersect: false },
    },
    scales: {
      x: { grid: { color: "rgba(192, 201, 192, 0.3)" } },
      y: { grid: { color: "rgba(192, 201, 192, 0.3)" } },
    },
  };

  return <Line data={chartData} options={chartOptions} />;
};
