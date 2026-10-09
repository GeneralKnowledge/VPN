"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/logo";
import { PasswordInput } from "@/components/password-input";
import { Button, FormError, Input, Label } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function LoginForm({ showDevHint }: { showDevHint: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
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
      setError(data.error ?? "Login failed");
      return;
    }
    router.push(data.redirectTo ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-lg">
        <Logo />
        <h1 className="mt-6 font-display text-3xl">Log in</h1>
        {showDevHint ? (
          <p className="mt-2 text-sm text-muted">
            Dev seeds: customer@northstar.local / CustomerDev123!
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">Welcome back. Sign in to manage your VPN.</p>
        )}
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" aria-describedby="login-error" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" aria-describedby="login-error" />
          </div>
          <FormError id="login-error">{error}</FormError>
          <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-sea hover:underline">
            Forgot password?
          </Link>
        </p>
        <p className="mt-4 text-center text-sm text-muted">
          No account?{" "}
          <Link href="/register" className="text-sea hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
