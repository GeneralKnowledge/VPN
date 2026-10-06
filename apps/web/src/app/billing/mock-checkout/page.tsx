"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Card } from "@/components/ui";

function CheckoutInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="hero-mesh flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <Logo />
        <h1 className="mt-6 font-display text-3xl">Mock checkout</h1>
        <p className="mt-2 text-sm text-muted">
          Development billing simulation. No real card is charged. Completing this provisions VPN access.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">Session: {sessionId}</p>
        <Button
          className="mt-6 w-full"
          disabled={!sessionId || loading}
          onClick={async () => {
            if (!sessionId) return;
            setLoading(true);
            const res = await fetch("/api/billing/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            setLoading(false);
            if (!res.ok) {
              setError(data.error ?? "Failed");
              return;
            }
            router.push(data.redirectTo ?? "/dashboard");
            router.refresh();
          }}
        >
          {loading ? "Processing…" : "Pay with mock card"}
        </Button>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Card>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <CheckoutInner />
    </Suspense>
  );
}
