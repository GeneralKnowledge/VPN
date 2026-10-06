import { eq } from "drizzle-orm";
import {
  auditEvents,
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
  const audits = await db.select().from(auditEvents).where(eq(auditEvents.targetId, id)).limit(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">{user.email}</h1>
        <p className="text-sm text-muted">
          {user.name} · lifecycle {user.lifecycle}
        </p>
      </div>
      <AdminCustomerActions userId={user.id} vpnStatus={vpn?.status} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg">Subscription</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {subs.map((s) => (
              <li key={s.id}>
                {s.planId} · <Badge>{s.status}</Badge>
              </li>
            ))}
            {subs.length === 0 ? <li className="text-muted">None</li> : null}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg">VPN account</h2>
          {vpn ? (
            <div className="mt-3 text-sm">
              <p>{vpn.username}</p>
              <Badge tone={vpn.status === "active" ? "success" : "warning"}>{vpn.status}</Badge>
              <p className="mt-2 font-mono text-xs text-muted">{vpn.providerAccountId}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Not provisioned</p>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="font-display text-lg">Connections</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {conns.map((c) => (
            <li key={c.id}>
              {c.name} · {c.protocol} {c.revokedAt ? "(revoked)" : ""}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-display text-lg">Audit</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {audits.map((a) => (
            <li key={a.id}>{a.action}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
