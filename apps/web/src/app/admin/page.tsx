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
import { activityLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data-table";

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
      <PageHeader title="Overview" description="Operational snapshot of customers, subscriptions, and recent activity." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-sm text-muted">Customers</p><p className="font-display text-3xl">{customerCount}</p></Card>
        <Card><p className="text-sm text-muted">Active subs</p><p className="font-display text-3xl">{subCount}</p></Card>
        <Card><p className="text-sm text-muted">VPN accounts</p><p className="font-display text-3xl">{vpnCount}</p></Card>
        <Card><p className="text-sm text-muted">Open tickets</p><p className="font-display text-3xl">{openTickets}</p></Card>
      </div>
      <section className="space-y-3">
        <h2 className="font-display text-xl">Recent audit events</h2>
        <DataTable
          caption="Recent audit events"
          emptyTitle="No audit events yet"
          rows={recent}
          rowKey={(e) => e.id}
          columns={[
            { key: "action", header: "Action", cell: (e) => activityLabel(e.action) },
            {
              key: "target",
              header: "Target",
              className: "text-muted",
              cell: (e) => (e.targetId ? `${e.targetType} ${e.targetId.slice(0, 12)}…` : e.targetType ?? "—"),
            },
            {
              key: "when",
              header: "When",
              className: "whitespace-nowrap text-muted",
              cell: (e) => formatDateTime(e.createdAt),
            },
          ]}
        />
      </section>
    </div>
  );
}
