"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import {
  Button,
  Tag,
  Tile,
  TextInput,
  PasswordInput,
} from "@carbon/react";
import { UserAvatar, Restart, Save, Locked, SecurityServices, Time } from "@carbon/icons-react";

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const { ok, err } = useToast();
  
  // Real state for the profile
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  
  // State for password change mock
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  if (isLoading) {
    return <div className="text-label text-ink-3">Loading profile…</div>;
  }

  if (!user) {
    return <div className="text-label text-ink-3">Not signed in.</div>;
  }

  const handleSaveProfile = () => {
    if (!displayName.trim()) {
      err("Display name cannot be empty.");
      return;
    }
    // In a real app, this would call API.updateProfile
    // For the demo, we show a success toast and update local state
    ok("Profile updated successfully!");
  };

  const handleChangePassword = () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      err("All password fields are required.");
      return;
    }
    if (newPwd.length < 8) {
      err("New password must be at least 8 characters long.");
      return;
    }
    if (newPwd !== confirmPwd) {
      err("New passwords do not match.");
      return;
    }
    
    // Mock success
    ok("Password changed successfully!");
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
  };

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in font-sans pb-10">
      {/* Top breadcrumb header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider">
          <span>GRIDOPS REGIONAL NODE</span>
          <span className="text-line">/</span>
          <span>220 ASSETS</span>
          <span className="text-line">/</span>
          <span>8 CREWS</span>
          <span className="text-line">/</span>
          <span className="text-brand-ink font-bold">PROFILE</span>
        </div>
        <div className="flex items-center gap-2 text-micro">
          <span className="flex items-center gap-1.5 font-mono text-brand-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-ink animate-pulse" />
            Telemetry Lock: 100.00%
          </span>
          <span className="text-line">|</span>
          <span className="font-mono text-ink-3">LATENCY: 51ms</span>
        </div>
      </div>

      {/* Top Banner Tile */}
      <Tile className="flex items-center justify-between shadow-panel border border-line rounded-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#0f5132] flex items-center justify-center text-white shrink-0 shadow-inner">
            <UserAvatar size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[28px] font-bold text-ink leading-tight tracking-tight">
                {displayName || user.email}
              </h1>
              <Tag type="green" size="md" className="uppercase font-bold tracking-wider m-0">
                <span className="flex items-center gap-1">
                  <SecurityServices size={14} />
                  {user.role.toUpperCase()}
                </span>
              </Tag>
            </div>
            <p className="text-label text-ink-2 mt-0.5">
              {user.email} <span className="text-line mx-1.5">•</span> Central Grid Control
            </p>
          </div>
        </div>
        <Button kind="ghost" renderIcon={Restart} size="md" className="font-medium text-ink" onClick={() => window.location.reload()}>
          Refresh Profile API
        </Button>
      </Tile>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left Panel: Operator Information */}
        <Tile className="lg:col-span-7 shadow-panel border border-line rounded-xl p-5 flex flex-col h-full">
          <div className="flex items-center gap-2 text-micro uppercase tracking-widest text-ink font-semibold border-b border-line pb-2 mb-4">
            <UserAvatar size={16} className="text-ink" />
            OPERATOR INFORMATION
            <span className="ml-auto text-ink-3 tracking-normal normal-case font-mono">Live Sync to DB</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
            <TextInput
              id="work-email"
              labelText="WORK EMAIL (READ ONLY)"
              value={user.email}
              readOnly
              className="bg-brand-surface border-line"
            />
            <TextInput
              id="display-name"
              labelText="DISPLAY NAME"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            
            <TextInput
              id="role-read-only"
              labelText="SYSTEM ROLE (READ ONLY)"
              value={user.role}
              readOnly
              className="bg-brand-surface border-line"
            />
            
            <TextInput
              id="account-id"
              labelText="ACCOUNT ID (READ ONLY)"
              value={String(user.id)}
              readOnly
              className="bg-brand-surface border-line"
            />
          </div>
          
          <div className="mt-6 pt-4 border-t border-line flex justify-end">
            <Button onClick={handleSaveProfile} renderIcon={Save} size="md" className="bg-[#0f5132] hover:bg-[#0a3622]">
              SAVE PROFILE CHANGES
            </Button>
          </div>
        </Tile>

        {/* Right Panel Stack */}
        <div className="lg:col-span-5 flex flex-col gap-4 h-full">
          
          {/* Update Credentials */}
          <Tile className="shadow-panel border border-line rounded-xl p-5">
            <div className="flex items-center gap-2 text-micro uppercase tracking-widest text-ink font-semibold pb-1">
              <Locked size={16} className="text-ink" />
              UPDATE CREDENTIALS
            </div>
            <p className="text-micro text-ink-3 mb-4">PBKDF2-HMAC-SHA256 encrypted authentication</p>
            
            <div className="space-y-4">
              <PasswordInput
                id="current-pwd"
                labelText="CURRENT PASSWORD"
                placeholder="••••••••"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
              />
              <PasswordInput
                id="new-pwd"
                labelText="NEW PASSWORD (MIN 8 CHARS)"
                placeholder="••••••••"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
              <PasswordInput
                id="confirm-pwd"
                labelText="CONFIRM NEW PASSWORD"
                placeholder="••••••••"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
              <Button onClick={handleChangePassword} size="md" className="w-full bg-[#161616] hover:bg-[#262626] mt-2 justify-center" renderIcon={Locked}>
                CHANGE PASSWORD
              </Button>
            </div>
          </Tile>

          {/* Security & Account Metadata */}
          <Tile className="shadow-panel border border-[#a2e9c2] bg-[#f0fbf5] rounded-xl p-5 mt-auto">
            <div className="flex items-center gap-2 text-micro uppercase tracking-widest text-[#0f5132] font-semibold">
              <Time size={16} />
              SECURITY & ACCOUNT METADATA
            </div>
            {/* Added for structural parity with the image, mock data inside */}
            <div className="mt-3 text-micro text-ink-2 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Account created:</span>
                <span className="font-semibold">{new Date(user.created_at || Date.now()).toLocaleString("en-GB", { hour12: false })}</span>
              </div>
              <div className="flex justify-between">
                <span>Last login:</span>
                <span className="font-semibold">{new Date().toLocaleString("en-GB", { hour12: false })}</span>
              </div>
              <div className="flex justify-between">
                <span>2FA Status:</span>
                <span className="font-semibold text-[#0f5132]">ENABLED (Hardware Key)</span>
              </div>
            </div>
          </Tile>

        </div>
      </div>
    </div>
  );
}
