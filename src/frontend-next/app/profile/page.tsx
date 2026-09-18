"use client";

import React, { useState, useEffect } from "react";
import { User, Shield, Key, Phone, Building, BadgeCheck, Save, RefreshCw, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";

export default function ProfilePage() {
  const { user, setUser, refreshUser } = useAuth();
  const { ok, err } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || user.email.split("@")[0]);
      setTitle(user.title || "Grid Operator");
      setDepartment(user.department || "RC4 Operations");
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
      ok("Profile data refreshed from backend");
    } catch (e: any) {
      err(e.message || "Failed to fetch profile details");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await API.updateProfile({
        display_name: displayName,
        title,
        department,
        phone,
      });

      setUser(res.user);
      ok(res.message || "Profile details saved successfully");
    } catch (e: any) {
      err(e.message || "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      err("Current password is required");
      return;
    }
    if (newPassword.length < 8) {
      err("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      err("New passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const res = await API.updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setUser(res.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      ok("Password updated successfully");
    } catch (e: any) {
      err(e.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-[#c0c9c0] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#0f5132] text-white flex items-center justify-center border-2 border-[#95d4ac] shadow-md flex-shrink-0">
            <User className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#0b1c30]">
                {user?.display_name || user?.email.split("@")[0] || "Operator Profile"}
              </h1>
              <span className="px-2 py-0.5 bg-[#baeed9] text-[#002117] font-mono text-[11px] font-bold rounded uppercase tracking-wider flex items-center gap-1 border border-[#95d4ac]">
                <BadgeCheck className="w-3.5 h-3.5 text-[#0f5132]" />
                {user?.role || "OPERATOR"}
              </span>
            </div>
            <p className="text-xs text-[#707971] mt-1 font-mono">
              {user?.email} &bull; {user?.department || "RC4 Operations"} &bull; {user?.title || "Grid Operator"}
            </p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-2 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] border border-[#c0c9c0] rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-colors self-start md:self-auto shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh Profile API
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal & Operator Info Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#c0c9c0] p-6 shadow-sm space-y-5">
          <div className="border-b border-[#c0c9c0]/50 pb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0b1c30] uppercase font-mono tracking-tight flex items-center gap-2">
              <User className="w-4 h-4 text-[#0f5132]" /> Operator Information
            </h2>
            <span className="text-[11px] font-mono text-[#707971]">Live Sync to DB</span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Work Email (Read Only)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    disabled
                    value={user?.email || ""}
                    className="w-full h-10 px-3 bg-[#eff4ff] text-[#707971] text-xs font-mono rounded-lg border border-[#c0c9c0] cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maya O'Connell"
                  className="w-full h-10 px-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132] font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Role Title / Rank
                </label>
                <div className="relative flex items-center">
                  <Building className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Dispatch Officer"
                    className="w-full h-10 pl-9 pr-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Control Room / Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. RC4 Grid Operations Center"
                  className="w-full h-10 px-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Emergency Contact Phone
                </label>
                <div className="relative flex items-center">
                  <Phone className="w-4 h-4 text-[#707971] absolute left-3 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full h-10 pl-9 pr-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#c0c9c0]/40 flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-[#0f5132] hover:bg-[#003820] text-white font-mono text-xs font-bold uppercase rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Save Profile Changes
              </button>
            </div>
          </form>
        </div>

        {/* Security & Password Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#c0c9c0] p-6 shadow-sm space-y-5">
            <div className="border-b border-[#c0c9c0]/50 pb-3">
              <h2 className="text-base font-bold text-[#0b1c30] uppercase font-mono tracking-tight flex items-center gap-2">
                <Key className="w-4 h-4 text-[#0f5132]" /> Update Credentials
              </h2>
              <p className="text-[11.5px] text-[#707971] mt-0.5">PBKDF2-HMAC-SHA256 encrypted authentication</p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#404942] uppercase font-semibold mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 bg-white text-[#0b1c30] text-xs rounded-lg border border-[#c0c9c0] focus:outline-none focus:ring-2 focus:ring-[#0f5132]"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 h-9 bg-[#233144] hover:bg-[#0d1c2f] text-white font-mono text-xs font-bold uppercase rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Shield className="w-3.5 h-3.5 text-[#95d4ac]" /> Change Password
              </button>
            </form>
          </div>

          {/* Account Metadata Summary */}
          <div className="bg-[#eff4ff] rounded-xl border border-[#c0c9c0] p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 text-[#003820] font-bold uppercase text-[11px] border-b border-[#c0c9c0]/50 pb-2">
              <Clock className="w-3.5 h-3.5" /> Security & Account Metadata
            </div>
            <div className="flex justify-between text-[11.5px] text-[#404942]">
              <span>User ID:</span>
              <span className="font-bold text-[#0b1c30]">#{user?.id || 1}</span>
            </div>
            <div className="flex justify-between text-[11.5px] text-[#404942]">
              <span>Access Level:</span>
              <span className="font-bold text-[#0f5132] uppercase">{user?.role || "OPERATOR"}</span>
            </div>
            <div className="flex justify-between text-[11.5px] text-[#404942]">
              <span>Account Created:</span>
              <span className="text-[#0b1c30]">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "Active"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
