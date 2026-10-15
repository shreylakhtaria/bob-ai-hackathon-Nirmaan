"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { MetricsDrawer } from "@/components/layout/MetricsDrawer";
import { FloatingCopilot } from "@/components/layout/FloatingCopilot";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10000,
    },
  },
});

const SIDEBAR_COLLAPSE_KEY = "grid_sidebar_collapsed";

function AppShell({ children }: { children: React.ReactNode }) {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (!isLoading && !token && !isAuthPage) {
      router.replace("/login");
    }
  }, [isLoading, token, isAuthPage, router]);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1");
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  if (isAuthPage) {
    return <main className="min-h-screen bg-[#f8f9ff]">{children}</main>;
  }

  if (isLoading || !token) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center font-mono text-xs text-[#707971]">
        Redirecting to operator authentication...
      </div>
    );
  }

  return (
    <>
      <Topbar />
      <Sidebar
        onOpenMetrics={() => setMetricsOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />
      <div
        className={`flex flex-col min-h-screen transition-[padding-left] duration-200 ${
          sidebarCollapsed ? "pl-[68px]" : "pl-64"
        }`}
      >
        <Breadcrumb />
        <main className="w-full pt-24 px-4 pb-8 bg-[#f8f9ff] flex-1">{children}</main>
      </div>
      <MetricsDrawer isOpen={metricsOpen} onClose={() => setMetricsOpen(false)} />
      <FloatingCopilot />
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
