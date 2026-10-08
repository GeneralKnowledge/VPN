"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function BillingActions({
  planId,
  status,
  prefer,
}: {
  planId?: string;
  status?: string;
  prefer?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const autoStarted = useRef(false);

  async function startCheckout(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: id }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data.url) {
        setError(data.error ?? "Checkout failed");
        setLoading(false);
        return;
      }
      router.push(data.url);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function post(path: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) setError(data.error ?? "That didn’t work. Please try again.");
      else router.refresh();
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  useEffect(() => {
    // Guard against React strict-mode double invocation, which would start two checkouts.
    if (prefer && planId && !autoStarted.current) {
      autoStarted.current = true;
      void startCheckout(planId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (planId) {
    return (
      <div className="mt-3">
        <Button type="button" disabled={loading} onClick={() => startCheckout(planId)}>
          {loading ? "Starting…" : "Subscribe"}
        </Button>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  if (status === "active" || status === "trialing" || status === "past_due") {
    return (
      <div className="mt-4">
        <Button
          variant="secondary"
          type="button"
          disabled={loading}
          onClick={() => post("/api/billing/cancel", "Cancel at end of billing period?")}
        >
          Cancel subscription
        </Button>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  if (status === "cancelling") {
    return (
      <div className="mt-4">
        <Button type="button" disabled={loading} onClick={() => post("/api/billing/resume")}>
          Resume subscription
        </Button>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return null;
}
