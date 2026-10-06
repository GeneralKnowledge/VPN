"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

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

  async function startCheckout(id: string) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: id }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Checkout failed");
      return;
    }
    router.push(data.url);
  }

  useEffect(() => {
    if (prefer && planId) void startCheckout(planId);
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

  if (status === "active" || status === "trialing") {
    return (
      <div className="mt-4">
        <Button
          variant="secondary"
          type="button"
          onClick={async () => {
            if (!confirm("Cancel at end of billing period?")) return;
            await fetch("/api/billing/cancel", { method: "POST" });
            router.refresh();
          }}
        >
          Cancel subscription
        </Button>
      </div>
    );
  }

  if (status === "cancelling") {
    return (
      <div className="mt-4">
        <Button
          type="button"
          onClick={async () => {
            await fetch("/api/billing/resume", { method: "POST" });
            router.refresh();
          }}
        >
          Resume subscription
        </Button>
      </div>
    );
  }

  return null;
}
