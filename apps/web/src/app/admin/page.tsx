import { sql } from "drizzle-orm";
import {
  auditEvents,
  subscriptions,
  supportTickets,
  users,
  vpnAccounts,
} from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Card } from "@/components/ui";

export default async function AdminOverview() {
  await requireAdmin();
  const db = getDb();
  const customerCount = (await db.select({ c: sql<number>`count(*)` }).from(users).where(sql`role = 'customer' and deleted_at is null`))[0]?.c ?? 0;
  const subCount = (await db.select({ c: sql<number>`count(*)` }).from(subscriptions).where(sql`status = 'active'`))[0]?.c ?? 0;
  const vpnCount = (await db.select({ c: sql<number>`count(*)` }).from(vpnAccounts).where(sql`status = 'active'`))[0]?.c ?? 0;
  const openTickets = (await db.select({ c: sql<number>`count(*)` }).from(supportTickets).where(sql`status = 'open'`))[0]?.c ?? 0;
  const recent = await db.select().from(auditEvents).orderBy(sql`created_at desc`).limit(12);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-sm text-muted">Customers</p><p className="font-display text-3xl">{customerCount}</p></Card>
        <Card><p className="text-sm text-muted">Active subs</p><p className="font-display text-3xl">{subCount}</p></Card>
        <Card><p className="text-sm text-muted">VPN accounts</p><p className="font-display text-3xl">{vpnCount}</p></Card>
        <Card><p className="text-sm text-muted">Open tickets</p><p className="font-display text-3xl">{openTickets}</p></Card>
      </div>
      <Card>
        <h2 className="font-display text-xl">Recent audit events</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {recent.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2">
              <span>{e.action}</span>
              <span className="text-muted">{e.targetType} {e.targetId?.slice(0, 12)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
