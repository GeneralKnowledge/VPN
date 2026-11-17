"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function EsimOrderActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { confirm, toast } = useFeedback();
  const canRetry = status === "failed" || status === "needs_review";
  const canRefund = ["failed", "needs_review", "refund_due", "paid"].includes(status);
  if (!canRetry && !canRefund) return null;

  async function run(action: "retry" | "refund") {
    const ok = await confirm(
      action === "refund"
        ? { title: "Refund this order in full?", confirmLabel: "Refund", destructive: true }
        : {
            title: "Issue this eSIM again?",
            description:
              status === "needs_review"
                ? "Check the ResellPortal panel first: if an eSIM already exists for this order, retrying buys a second one."
                : undefined,
            confirmLabel: "Retry",
          },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/esim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      const data = (await safeJson(res)) as { status?: string; error?: string };
      toast(res.ok ? `Now ${data.status}` : (data.error ?? "Failed"), res.ok ? "success" : "danger");
      router.refresh();
    } catch {
      toast("Network error. Please try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {canRetry ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("retry")}>
          Retry
        </Button>
      ) : null}
      {canRefund ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("refund")}>
          Refund
        </Button>
      ) : null}
    </div>
  );
}
