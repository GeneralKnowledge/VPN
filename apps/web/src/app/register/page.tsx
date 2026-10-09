"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";
import { Logo } from "@/components/logo";
import { PasswordInput } from "@/components/password-input";
import { Button, FormError, Input, Label } from "@/components/ui";
import { safeJson } from "@/lib/client";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    let res: Response;
    try {
      res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          name: form.get("name"),
          planId: params.get("plan") ?? undefined,
          referralCode: form.get("referralCode") || undefined,
        }),
      });
    } catch {
      setLoading(false);
      setError("Network error. Please try again.");
      return;
    }
    const data = await safeJson(res);
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      return;
    }
    router.push(data.redirectTo ?? "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" aria-describedby="register-error" />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="password-hint register-error"
        />
        <p id="password-hint" className="mt-1.5 text-xs text-muted">
          At least 8 characters. A longer passphrase is stronger.
        </p>
      </div>
      <div>
        <Label htmlFor="referralCode">Referral code (optional)</Label>
        <Input id="referralCode" name="referralCode" placeholder="NORTH-ABCD123" />
      </div>
      <FormError id="register-error">{error}</FormError>
      <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg">
        <Logo />
        <h1 className="mt-6 font-display text-3xl">Create account</h1>
        <p className="mt-2 text-sm text-muted">Create your account to get started.</p>
        <Suspense>
          <RegisterForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-sea hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
