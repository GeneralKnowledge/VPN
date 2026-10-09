"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
import { safeJson } from "@/lib/client";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const data = await safeJson(res);
      setMessage(res.ok ? (data.message ?? "If that email exists, a reset link was sent.") : (data.error ?? "Something went wrong. Please try again."));
      setDevLink(data.devResetUrl ?? null);
    } catch {
      setMessage("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <Logo />
        <h1 className="mt-6 font-display text-3xl">Reset password</h1>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <div aria-live="polite">{message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}</div>
        {devLink ? (
          <p className="mt-2 break-all text-sm text-sea">
            Dev link: <Link href={devLink}>{devLink}</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
