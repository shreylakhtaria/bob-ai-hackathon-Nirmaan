"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, LoginRequest, SignupRequest } from "@/types/auth";
import { API } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await API.me();
      setUser(userData);
    } catch (_) {}
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem("grid_auth_token");
    if (savedToken) {
      setToken(savedToken);
      API.me()
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          localStorage.removeItem("grid_auth_token");
          setToken(null);
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const res = await API.login(data);
    localStorage.setItem("grid_auth_token", res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (data: SignupRequest) => {
    const res = await API.signup(data);
    localStorage.setItem("grid_auth_token", res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("grid_auth_token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
