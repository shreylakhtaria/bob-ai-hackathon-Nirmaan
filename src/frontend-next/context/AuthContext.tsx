"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, LoginRequest, SignupRequest } from "@/types/auth";
import { API, setAccessToken, refreshAccessToken } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<number>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On load there is no access token in memory (a reload clears it), so the
  // session is restored from the HttpOnly refresh cookie instead. This is the
  // trade for not persisting a bearer token where script can read it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (cancelled) return;
        if (token) setUser(await API.me());
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const res = await API.login(data);
    setAccessToken(res.access_token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (data: SignupRequest) => {
    const res = await API.signup(data);
    setAccessToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    // Server-side revocation, so the refresh token is dead even if the cookie
    // was already copied elsewhere. Clear local state regardless of the result.
    try { await API.logout(); } catch { /* already invalid */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  const logoutEverywhere = useCallback(async () => {
    let revoked = 0;
    try { revoked = (await API.logoutAll()).sessions_revoked; } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    return revoked;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, signup, logout, logoutEverywhere }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
