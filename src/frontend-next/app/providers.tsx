"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { MetricsDrawer } from "@/components/layout/MetricsDrawer";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { CopilotWidget } from "@/components/copilot/CopilotWidget";

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
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // The landing page is fully self-contained (own header/main/footer, no client
  // hooks, no auth/query/toast needs). Routing it through the auth frame nested
  // one <main> inside another and vertically centred a full-width page.
  if (pathname === "/") return <>{children}</>;

  // Sign-in and registration sat inside the full operator shell, so a visitor
  // who was not signed in still saw a nine-item nav, a live asset count and an
  // "Emergency dispatch" button. That claims an operational session that does
  // not exist, and offers an irreversible action to someone with no account.
  // Auth routes get the bare frame.
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {isAuthRoute ? (
            <main className="min-h-screen bg-canvas flex items-center justify-center px-5 py-12">
              {children}
            </main>
          ) : (
            <>
              {/* A console is driven from the keyboard during an incident;
                  without this, reaching the content means tabbing the whole
                  nav on every page. */}
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-panel focus:px-4 focus:py-2 focus:text-label focus:font-semibold focus:text-ink focus:shadow-overlay"
              >
                Skip to content
              </a>
              <Topbar onToggleNav={() => setNavOpen((v) => !v)} navOpen={navOpen} />
              <Sidebar
                onOpenMetrics={() => setMetricsOpen(true)}
                open={navOpen}
                onClose={() => setNavOpen(false)}
              />
              <div className="lg:pl-[var(--spacing-rail)] flex flex-col min-h-screen rail-anim">
                <Breadcrumb />
                <main
                  id="main"
                  className="w-full px-5 pb-10 bg-canvas flex-1 pt-[calc(var(--spacing-topbar)+var(--spacing-crumb)+1.25rem)]"
                >
                  <RequireAuth>{children}</RequireAuth>
                </main>
              </div>
              <MetricsDrawer isOpen={metricsOpen} onClose={() => setMetricsOpen(false)} />
              {/* Global, so "why is this critical?" can be asked from the page
                  the operator is already looking at. */}
              <CopilotWidget />
            </>
          )}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
