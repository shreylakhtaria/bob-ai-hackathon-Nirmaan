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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password !== confirmPassword) {
      err("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await signup({ email, password });
      ok("Operator account created successfully");
      router.push("/overview");
    } catch (e: any) {
      err(e.message || "Registration failed");
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
            Register Operator
          </h1>
          <p className="text-[12px] text-[#707971]">
            Create a new operator account for grid command center access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-[#404942] uppercase font-bold mb-1">
              Work Email
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new.operator@gridops.power"
                className="w-full h-9 pl-9 pr-3 bg-[#eff4ff] text-[#0b1c30] text-[12.5px] rounded-lg border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#404942] uppercase font-bold mb-1">
              Create Password (min 8 characters)
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 pl-9 pr-3 bg-[#eff4ff] text-[#0b1c30] text-[12.5px] rounded-lg border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#404942] uppercase font-bold mb-1">
              Confirm Password
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 pl-9 pr-3 bg-[#eff4ff] text-[#0b1c30] text-[12.5px] rounded-lg border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-9 bg-[#0f5132] text-white font-mono text-[12px] font-bold uppercase rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" /> Create Account
          </button>
        </form>

        <div className="pt-2 text-center border-t border-[#c0c9c0]/40 text-[11.5px] text-[#707971]">
          Already have credentials?{" "}
          <Link href="/login" className="text-[#003820] font-bold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
