"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, LogIn, AlertTriangle } from "lucide-react";
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
    <div className="min-h-[80vh] flex items-center justify-center font-sans">
      <div className="bg-white rounded-xl shadow-xl border border-[#c0c9c0]/80 p-8 w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto shadow-sm border border-[#c0c9c0]/60 relative flex items-center justify-center">
            <Image src="/favicon.png" alt="Logo" width={48} height={48} className="object-cover" />
          </div>
          <h1 className="text-[20px] font-bold text-[#0b1c30] uppercase font-mono tracking-tight">
            Operator Access Login
          </h1>
          <p className="text-[12px] text-[#707971]">
            Grid Equipment Failure &amp; Outage Advisory System
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-[#404942] uppercase font-bold mb-1">
              Operator Email
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dispatcher@gridops.power"
                className="w-full h-9 pl-9 pr-3 bg-[#eff4ff] text-[#0b1c30] text-[12.5px] rounded-lg border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#404942] uppercase font-bold mb-1">
              Access Password
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 pl-9 pr-3 bg-[#eff4ff] text-[#0b1c30] text-[12.5px] rounded-lg border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11.5px] text-[#707971]">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#0b1c30]">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-[#c0c9c0] text-[#0f5132] focus:ring-[#0f5132]" />
              <span>Keep me signed in</span>
            </label>
            <a href="#" className="hover:text-[#003820] hover:underline" onClick={(e) => {
              e.preventDefault();
              err("Credential reset requires admin approval in simulation mode.");
            }}>
              Reset credentials
            </a>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-9 bg-[#0f5132] text-white font-mono text-[12px] font-bold uppercase rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" /> Sign In as Operator
          </button>
        </form>

        <div className="pt-2 text-center border-t border-[#c0c9c0]/40 text-[11.5px] text-[#707971]">
          Need new credentials?{" "}
          <Link href="/signup" className="text-[#003820] font-bold hover:underline">
            Register Operator Account
          </Link>
        </div>
      </div>
    </div>
  );
}
