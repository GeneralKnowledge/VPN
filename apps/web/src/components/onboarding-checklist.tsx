"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeJson } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Button, Card } from "./ui";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
  /** When set, the CTA runs this action instead of navigating. */
  ctaAction?: "resend-verification";
};

export function OnboardingChecklist({
  steps,
  title = "Get set up",
  description = "Finish these steps in your account — no app install from us required.",
  dismissible = true,
}: {
  steps: OnboardingStep[];
  title?: string;
  description?: string;
  dismissible?: boolean;
}) {
  const router = useRouter();
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (allDone) return null;

  const next = steps.find((s) => !s.done);

  async function resendVerification() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await safeJson(res);
      setStatus(res.ok ? "Verification email sent." : (data.error ?? "Couldn’t send. Try again later."));
    } catch {
      setStatus("Network error. Please try again.");
    }
    setBusy(false);
  }

  async function dismiss() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismiss: true }),
      });
      if (!res.ok) {
        setStatus((await safeJson(res)).error ?? "Couldn’t dismiss the checklist.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setStatus("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="border-sea/30 bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {doneCount} of {steps.length} complete
        </p>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3",
              step.done ? "border-border bg-surface-2/60" : "border-sea/25 bg-sea/5",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-success/20 text-success" : "bg-sea text-white",
                )}
                aria-hidden
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p className={cn("font-medium", step.done && "text-muted line-through")}>{step.title}</p>
                <p className="text-sm text-muted">{step.description}</p>
              </div>
            </div>
            {!step.done ? (
              step.ctaAction === "resend-verification" ? (
                <Button
                  size="sm"
                  variant={step.id === next?.id ? "primary" : "secondary"}
                  type="button"
                  disabled={busy}
                  onClick={resendVerification}
                >
                  {step.cta}
                </Button>
              ) : (
                <Link href={step.href}>
                  <Button size="sm" variant={step.id === next?.id ? "primary" : "secondary"}>
                    {step.cta}
                  </Button>
                </Link>
              )
            ) : null}
          </li>
        ))}
      </ol>
      {status ? (
        <p className="mt-3 text-sm text-muted" role="status">
          {status}
        </p>
      ) : null}
      {dismissible ? (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
          <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={dismiss}>
            I’ve imported my config
          </Button>
          <button
            type="button"
            className="text-sm text-muted underline-offset-2 hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={dismiss}
          >
            Dismiss checklist
          </button>
        </div>
      ) : null}
    </Card>
  );
}
