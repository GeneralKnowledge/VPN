import { desc, eq } from "drizzle-orm";
import {
  auditEvents,
  devices,
  providerEvents,
  subscriptions,
  users,
  vpnAccounts,
  vpnConnections,
} from "@northstar/db";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";
import { AdminCustomerActions } from "./actions";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) notFound();
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, id));
  const [vpn] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, id)).limit(1);
  const conns = await db.select().from(vpnConnections).where(eq(vpnConnections.userId, id));
  const deviceRows = await db.select().from(devices).where(eq(devices.userId, id));
  const audits = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);
  const pev = vpn
    ? await db
        .select()
        .from(providerEvents)
        .where(eq(providerEvents.targetId, vpn.id))
        .orderBy(desc(providerEvents.createdAt))
        .limit(10)
    : [];

  let lastError: Record<string, unknown> | null = null;
  if (vpn?.lastError) {
    try {
      lastError = JSON.parse(vpn.lastError) as Record<string, unknown>;
    } catch {
      lastError = { message: vpn.lastError };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">{user.email}</h1>
        <p className="text-sm text-muted">
          {user.name} · lifecycle {user.lifecycle}
        </p>
      </div>
      <AdminCustomerActions userId={user.id} vpnStatus={vpn?.status} connections={conns} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg">Subscription</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {subs.map((s) => (
              <li key={s.id}>
                {s.planId} · <Badge>{s.status}</Badge>
                {s.cancelAtPeriodEnd ? " · cancels at period end" : ""}
                {s.currentPeriodEnd ? (
                  <span className="block text-xs text-muted">
                    Period end {s.currentPeriodEnd.toISOString()}
                  </span>
                ) : null}
              </li>
            ))}
            {subs.length === 0 ? <li className="text-muted">None</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg">Local VPN account</h2>
          {vpn ? (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                Username <span className="font-mono">{vpn.username}</span>
              </p>
              <Badge tone={vpn.status === "active" ? "success" : "warning"}>{vpn.status}</Badge>
              <p className="font-mono text-xs text-muted">Local id {vpn.id}</p>
              <p className="font-mono text-xs text-muted">Provider account {vpn.providerAccountId}</p>
              <p className="text-xs text-muted">Attempts {vpn.provisionAttempts}</p>
              <p className="text-xs text-muted">
                Last reconcile {vpn.lastReconciledAt ? vpn.lastReconciledAt.toISOString() : "never"}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Not provisioned</p>
          )}
        </Card>
      </div>
      {lastError ? (
        <Card>
          <h2 className="font-display text-lg">Last provider error</h2>
          <pre className="mt-3 overflow-x-auto rounded bg-ink/5 p-3 font-mono text-xs">
            {JSON.stringify(lastError, null, 2)}
          </pre>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg">Connections</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {conns.map((c) => (
              <li key={c.id}>
                {c.name} · {c.protocol} {c.revokedAt ? "(revoked)" : ""}
              </li>
            ))}
            {conns.length === 0 ? <li className="text-muted">None</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg">Devices</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {deviceRows.map((d) => (
              <li key={d.id}>
                {d.name} · {d.platform} {d.revokedAt ? "(revoked)" : ""}
              </li>
            ))}
            {deviceRows.length === 0 ? <li className="text-muted">None</li> : null}
          </ul>
        </Card>
      </div>
      <Card>
        <h2 className="font-display text-lg">Provider events</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {pev.map((e) => (
            <li key={e.id} className="font-mono text-xs">
              {e.createdAt.toISOString()} · {e.action} · {e.status}
              {e.metadataJson ? ` · ${e.metadataJson}` : ""}
            </li>
          ))}
          {pev.length === 0 ? <li className="text-muted">None</li> : null}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-lg">Audit</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {audits.map((a) => (
            <li key={a.id}>
              {a.action}
              <span className="ml-2 text-xs text-muted">{a.createdAt.toISOString()}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
