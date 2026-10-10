"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function EsimBuyButton({ packageCode }: { packageCode: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        className="w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const res = await fetch("/api/esim/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageCode }),
          });
          const data = await safeJson(res);
          setLoading(false);
          if (res.status === 401) {
            router.push(`/login?next=${encodeURIComponent("/pricing")}`);
            return;
          }
          if (!res.ok) {
            setError(data.error ?? "Could not start checkout");
            return;
          }
          if (data.url) {
            router.push(data.url);
            return;
          }
          setError("No checkout URL returned");
        }}
      >
        {loading ? "Starting…" : "Buy"}
      </Button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
