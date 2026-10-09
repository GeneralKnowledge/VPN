"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Logo } from "@/components/logo";
import { PasswordInput } from "@/components/password-input";
import { Button, FormError, Label } from "@/components/ui";
import { safeJson } from "@/lib/client";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.get("token"),
          password: form.get("password"),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error ?? "Reset failed");
        setLoading(false);
        return;
      }
      router.push("/login");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="password-hint reset-error"
        />
        <p id="password-hint" className="mt-1.5 text-xs text-muted">
          At least 8 characters.
        </p>
      </div>
      <FormError id="reset-error">{error}</FormError>
      <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
        {loading ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <Logo />
        <h1 className="mt-6 font-display text-3xl">Choose a new password</h1>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
