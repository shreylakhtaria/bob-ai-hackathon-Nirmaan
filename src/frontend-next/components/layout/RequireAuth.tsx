"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";

/**
 * Client-side gate for console routes.
 *
 * This is a UX control, not the security boundary — the API rejects every
 * unauthenticated request on its own (see backend/deps.py), and anything
 * enforced only here could be bypassed by disabling JavaScript. Its job is to
 * stop a signed-out visitor staring at empty console chrome while a dozen
 * requests 401 in the background.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Carry the intended destination so sign-in can return the operator to
      // the page they actually asked for.
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // The session is restored asynchronously from the refresh cookie, so a brief
  // unauthenticated window is normal on load and must not flash the login page.
  if (isLoading) return <ScadaSkeletonLoader />;
  if (!isAuthenticated) return null;

  return <>{children}</>;
};
