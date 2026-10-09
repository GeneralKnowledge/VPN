import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { subscriptions, users } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { subscriptionStatus } from "@/lib/labels";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const rows = await getDb()
    .select({
      id: subscriptions.id,
      planId: subscriptions.planId,
      status: subscriptions.status,
      provider: subscriptions.provider,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      createdAt: subscriptions.createdAt,
      userId: users.id,
      email: users.email,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Live and historical customer subscriptions." />
      <DataTable
        caption="Subscriptions"
        emptyTitle="No subscriptions"
        rows={rows}
        rowKey={(s) => s.id}
        columns={[
          {
            key: "customer",
            header: "Customer",
            cell: (s) => (
              <Link href={`/admin/customers/${s.userId}`} className="font-medium hover:underline">
                {s.email}
              </Link>
            ),
          },
          { key: "plan", header: "Plan", cell: (s) => s.planId },
          {
            key: "status",
            header: "Status",
            cell: (s) => {
              const st = subscriptionStatus(s.status);
              return <Badge tone={st.tone}>{st.label}</Badge>;
            },
          },
          { key: "provider", header: "Provider", cell: (s) => s.provider },
          {
            key: "period",
            header: "Period end",
            className: "whitespace-nowrap text-muted",
            cell: (s) => formatDate(s.currentPeriodEnd),
          },
          {
            key: "cancel",
            header: "Cancel at end",
            cell: (s) => (s.cancelAtPeriodEnd ? "Yes" : "—"),
          },
        ]}
      />
    </div>
  );
}
