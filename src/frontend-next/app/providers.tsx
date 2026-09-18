"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { MetricsDrawer } from "@/components/layout/MetricsDrawer";

// Everything client-side lives here so app/layout.tsx can stay a server
// component. That is what lets the app export Next `metadata` (per-page titles,
// canonical, Open Graph) and ship real HTML to crawlers and link unfurlers —
// a "use client" root layout renders an empty shell for both.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10000,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [metricsOpen, setMetricsOpen] = useState(false);

  return (
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
  );
}
