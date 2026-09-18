"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const { ok, err } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !email || !password) return;
    if (displayName.trim().length < 2) {
      err("Operator name must be at least 2 characters");
      return;
    }
    if (password !== confirmPassword) {
      err("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await signup({ display_name: displayName, email, password });
      ok("Operator account created successfully");
      router.push("/overview");
    } catch (e: any) {
      err(e.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto shadow-panel border border-line relative flex items-center justify-center">
            <Image src="/favicon.png" alt="Logo" width={48} height={48} className="object-cover" />
          </div>
          <h1 className="text-title font-semibold text-ink tracking-tight">
            Register Operator
          </h1>
          <p className="text-label text-ink-3">
            Create a new operator account for grid command center access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-label font-medium text-ink mb-1.5">
              Operator Name
            </label>
            <div className="relative flex items-center">
              <UserPlus className="w-4 h-4 text-ink-3 absolute left-3 pointer-events-none" aria-hidden="true" />
              <input
                id="displayName"
                type="text"
                required
                minLength={2}
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Maya O&rsquo;Connell"
                className="w-full h-9 pl-9 pr-3 bg-sunken text-ink text-label rounded-lg border border-line focus:bg-panel focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-label font-medium text-ink mb-1.5">
              Work Email
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-ink-3 absolute left-3 pointer-events-none" />
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new.operator@gridops.power"
                className="w-full h-9 pl-9 pr-3 bg-sunken text-ink text-label rounded-lg border border-line focus:bg-panel focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-label font-medium text-ink mb-1.5">
              Create Password (min 8 characters)
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-ink-3 absolute left-3 pointer-events-none" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 pl-9 pr-3 bg-sunken text-ink text-label rounded-lg border border-line focus:bg-panel focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-label font-medium text-ink mb-1.5">
              Confirm Password
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-ink-3 absolute left-3 pointer-events-none" />
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 pl-9 pr-3 bg-sunken text-ink text-label rounded-lg border border-line focus:bg-panel focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-9 bg-brand text-white text-label font-semibold uppercase rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-panel disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" /> Create Account
          </button>
        </form>

        <div className="pt-2 text-center border-t border-line text-micro text-ink-3">
          Already have credentials?{" "}
          <Link href="/login" className="text-brand-ink font-bold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
