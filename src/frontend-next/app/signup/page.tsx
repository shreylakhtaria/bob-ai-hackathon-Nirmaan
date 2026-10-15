"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Form,
  InlineNotification,
  PasswordInput,
  Stack,
  TextInput,
} from "@carbon/react";
import { UserFollow } from "@carbon/icons-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const { ok } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validated as user types rather than only on submit
  const nameTooShort = displayName.length > 0 && displayName.trim().length < 2;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    !!displayName && !!email && password.length >= 8 && !nameTooShort && !mismatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);
    try {
      const user = await signup({ display_name: displayName, email, password });
      if (user?.role === "crew") {
        ok("Field Crew technician account registered successfully");
        router.push("/crews");
      } else if (user?.role === "admin") {
        ok("Administrator account registered successfully");
        router.push("/admin");
      } else if (user?.status === "pending") {
        ok("Registration submitted. Operator access is pending administrator approval.");
        router.push("/overview");
      } else {
        ok("Account registered successfully");
        router.push("/overview");
      }
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl overflow-hidden mx-auto border border-line relative flex items-center justify-center">
          <Image src="/favicon.png" alt="" width={48} height={48} className="object-cover" />
        </div>
        <h1 className="mt-4 text-title font-semibold text-ink tracking-tight">
          Register account
        </h1>
        <p className="mt-1 text-label text-ink-3">
          Grid Risk Advisor &amp; Operations Console
        </p>
      </div>

      <Form onSubmit={handleSubmit}>
        <Stack gap={5}>
          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              title="Could not create the account"
              subtitle={error}
              onCloseButtonClick={() => setError(null)}
            />
          )}

          <TextInput
            id="displayName"
            labelText="Full name"
            placeholder="e.g. Maya O’Connell or Alex Mercer"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            invalid={nameTooShort}
            invalidText="At least 2 characters."
          />

          <TextInput
            id="email"
            type="email"
            labelText="Work email"
            placeholder="e.g. tech@gridops.power"
            helperText="Emails assigned to field crews in the roster automatically receive Field Crew access."
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordInput
            id="password"
            labelText="Create password"
            helperText="Minimum 8 characters."
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={passwordTooShort}
            invalidText="Minimum 8 characters."
            showPasswordLabel="Show password"
            hidePasswordLabel="Hide password"
          />

          <PasswordInput
            id="confirmPassword"
            labelText="Confirm password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            invalid={mismatch}
            invalidText="Passwords do not match."
            showPasswordLabel="Show password"
            hidePasswordLabel="Hide password"
          />

          <Button
            type="submit"
            id="signup-submit-btn"
            renderIcon={UserFollow}
            disabled={isLoading || !canSubmit}
            className="cds--btn--block"
          >
            {isLoading ? "Creating account…" : "Create account"}
          </Button>
        </Stack>
      </Form>

      <p className="mt-6 pt-5 text-center border-t border-line text-label text-ink-3">
        Already have credentials?{" "}
        <Link href="/login" className="font-medium text-brand-ink hover:underline">
          Sign in
        </Link>
      </p>

      {/* Role explanation */}
      <p className="mt-5 text-micro text-ink-3 text-center leading-relaxed">
        Permissions are mapped automatically. Roster-assigned technician emails access the{" "}
        <strong className="font-semibold text-ink">Field Crew</strong> terminal. Control room operators receive{" "}
        <strong className="font-semibold text-ink">Operator</strong> access.
      </p>
    </div>
  );
}
