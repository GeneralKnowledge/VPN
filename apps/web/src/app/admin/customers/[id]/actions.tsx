"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function AdminCustomerActions({
  userId,
  vpnStatus,
  connections,
}: {
  userId: string;
  vpnStatus?: string;
  connections: Array<{ id: string; name: string; revokedAt: Date | null }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/vpn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      diagnostic?: unknown;
      repaired?: string[];
      synced?: string[];
    };
    if (!res.ok) {
      setMessage(
        data.diagnostic
          ? `${data.error ?? "Failed"}: ${JSON.stringify(data.diagnostic)}`
          : (data.error ?? "Failed"),
      );
    } else {
      setMessage(
        action === "reconcile"
          ? `Reconcile done (repaired ${data.repaired?.length ?? 0}, synced ${data.synced?.length ?? 0})`
          : "OK",
      );
      router.refresh();
    }
    setBusy(false);
  }

  const activeConns = connections.filter((c) => !c.revokedAt);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => run("provision")}>
          Provision / retry
        </Button>
        <Button type="button" disabled={busy} onClick={() => run("reconcile")}>
          Reconcile
        </Button>
        <Button
          variant="danger"
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm("Suspend this customer’s VPN access at the provider?")) return;
            void run("suspend", { confirm: true });
          }}
        >
          Suspend
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm("Reactivate this customer’s VPN account?")) return;
            void run("reactivate");
          }}
        >
          Reactivate
        </Button>
        <Button
          variant="danger"
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm("DELETE the provider VPN account? This cannot be undone.")) return;
            if (!confirm("Type confirmation: permanently delete provider account?")) return;
            void run("delete_account", { confirm: true });
          }}
        >
          Delete provider account
        </Button>
        <span className="self-center text-sm text-muted">VPN: {vpnStatus ?? "none"}</span>
      </div>
      {activeConns.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeConns.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Revoke connection “${c.name}”?`)) return;
                void run("revoke_connection", { connectionId: c.id });
              }}
            >
              Revoke {c.name}
            </Button>
          ))}
        </div>
      ) : null}
      {message ? <p className="font-mono text-xs text-muted break-all">{message}</p> : null}
    </div>
  );
}
