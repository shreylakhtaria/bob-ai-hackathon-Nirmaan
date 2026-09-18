"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Form,
  InlineNotification,
  PasswordInput,
  Stack,
  TextInput,
} from "@carbon/react";
import { Login, Warning } from "@carbon/icons-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { ok } = useToast();

  // Start empty: prefilling real-looking credentials ships a working-looking
  // admin password to every visitor in the client bundle.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Shown inline beside the form rather than as a toast that slides away —
  // a failed sign-in is the thing the operator is looking at, and a toast
  // that has already dismissed itself cannot be re-read.
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);
    try {
      await login({ email, password });
      ok("Signed in successfully");
      // Return to whatever page sent us here, ignoring absolute URLs so this
      // cannot be used as an open redirect.
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview");
    } catch (e: any) {
      setError(e.message || "Invalid credentials");
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
        <h1 className="mt-4 text-title font-semibold text-ink tracking-tight">Sign in</h1>
        <p className="mt-1 text-label text-ink-3">
          Grid Equipment Failure &amp; Outage Advisor
        </p>
      </div>

      <Form onSubmit={handleSubmit}>
        <Stack gap={5}>
          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              title="Could not sign in"
              subtitle={error}
              onCloseButtonClick={() => setError(null)}
            />
          )}

          <TextInput
            id="email"
            type="email"
            labelText="Email"
            placeholder="dispatcher@gridops.power"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!error}
          />

          <PasswordInput
            id="password"
            labelText="Password"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            showPasswordLabel="Show password"
            hidePasswordLabel="Hide password"
          />

          <Button
            type="submit"
            renderIcon={Login}
            disabled={isLoading || !email || !password}
            className="cds--btn--block"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </Stack>
      </Form>

      <p className="mt-6 pt-5 text-center border-t border-line text-label text-ink-3">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-brand-ink hover:underline">
          Register an operator account
        </Link>
      </p>

      {/* Said plainly and up front rather than discovered after signing in. */}
      <p className="mt-5 flex items-start gap-2 text-micro text-ink-3">
        <Warning size={14} className="mt-px shrink-0 fill-current" aria-hidden="true" />
        This console runs on simulated grid data. Nothing you do here dispatches
        a real crew or changes a real asset.
      </p>
    </div>
  );
}
