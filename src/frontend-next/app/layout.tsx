"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { MetricsDrawer } from "@/components/layout/MetricsDrawer";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10000,
    },
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [metricsOpen, setMetricsOpen] = useState(false);

  return (
    <html lang="en">
      <head>
        <title>Grid Equipment Failure &amp; Outage Advisor</title>
        <meta
          name="description"
          content="Grid Risk Command Center — SCADA/ML-powered asset health, failure prediction and operational decision support for power utilities."
        />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </head>
      <body className="bg-[#f8f9ff] text-[#0b1c30] antialiased min-h-screen">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <Topbar />
              <Sidebar onOpenMetrics={() => setMetricsOpen(true)} />
              <div className="pl-64 flex flex-col min-h-screen">
                <Breadcrumb />
                <main className="w-full pt-24 px-4 pb-8 bg-[#f8f9ff] flex-1">
                  {children}
                </main>
              </div>
              <MetricsDrawer isOpen={metricsOpen} onClose={() => setMetricsOpen(false)} />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
