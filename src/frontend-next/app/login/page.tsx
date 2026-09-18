"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, LogIn, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { ok, err } = useToast();

  // Start empty: prefilling real-looking credentials ships a working-looking
  // admin password to every visitor in the client bundle.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    try {
      await login({ email, password });
      ok("Signed in successfully");
      router.push("/overview");
    } catch (e: any) {
      err(e.message || "Invalid credentials");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-7">
        <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto border border-line relative flex items-center justify-center">
          <Image src="/favicon.png" alt="" width={48} height={48} className="object-cover" />
        </div>
        <h1 className="mt-4 text-title font-semibold text-ink tracking-tight">
          Sign in
        </h1>
        <p className="mt-1 text-label text-ink-3">
          Grid Equipment Failure &amp; Outage Advisor
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-label font-medium text-ink mb-1.5">
            Email
          </label>
          <div className="relative flex items-center">
            <Mail className="w-4 h-4 text-ink-3 absolute left-3 pointer-events-none" aria-hidden="true" />
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dispatcher@gridops.power"
              className="w-full min-h-10 pl-9 pr-3 bg-panel text-ink text-body rounded-lg border border-line-strong hover:border-ink-3"
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label htmlFor="password" className="block text-label font-medium text-ink">
              Password
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                err("Credential reset requires admin approval in simulation mode.");
              }}
              className="text-micro text-ink-3 hover:text-ink hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative flex items-center">
            <Lock className="w-4 h-4 text-ink-3 absolute left-3 pointer-events-none" aria-hidden="true" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full min-h-10 pl-9 pr-11 bg-panel text-ink text-body rounded-lg border border-line-strong hover:border-ink-3"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 w-9 h-9 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-sunken"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-label text-ink-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-line-strong accent-brand"
          />
          Keep me signed in
        </label>

        <button
          type="submit"
          disabled={isLoading || !email || !password}
          className="w-full min-h-11 bg-brand text-white text-body font-semibold rounded-lg hover:bg-brand-ink flex items-center justify-center gap-2 disabled:opacity-45"
        >
          {isLoading ? (
            "Signing in\u2026"
          ) : (
            <>
              <LogIn className="w-4 h-4" aria-hidden="true" /> Sign in
            </>
          )}
        </button>
      </form>

      <p className="mt-6 pt-5 text-center border-t border-line text-label text-ink-3">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-brand-ink hover:underline">
          Register an operator account
        </Link>
      </p>

      {/* Said plainly and up front rather than discovered after signing in. */}
      <p className="mt-5 flex items-start gap-2 text-micro text-ink-3">
        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
        This console runs on simulated grid data. Nothing you do here dispatches
        a real crew or changes a real asset.
      </p>
    </div>
  );
}
