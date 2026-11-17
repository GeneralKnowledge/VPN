import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { esimOrders, users } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";
import { EsimOrderActions } from "./order-actions";

export default async function AdminEsimOrdersPage() {
  await requireAdmin();
  const rows = await getDb()
    .select({
      id: esimOrders.id,
      packageName: esimOrders.packageName,
      countryCode: esimOrders.countryCode,
      amount: esimOrders.amount,
      currency: esimOrders.currency,
      status: esimOrders.status,
      lastError: esimOrders.lastError,
      issueAttempts: esimOrders.issueAttempts,
      createdAt: esimOrders.createdAt,
      userId: users.id,
      email: users.email,
    })
    .from(esimOrders)
    .innerJoin(users, eq(esimOrders.userId, users.id))
    .orderBy(desc(esimOrders.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="eSIM orders" description="One-time eSIM purchases and issue status. needs_review: the provider may have issued it, so check the ResellPortal panel before Retry." />
      <DataTable
        caption="eSIM orders"
        emptyTitle="No eSIM orders yet"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "customer",
            header: "Customer",
            cell: (r) => (
              <Link href={`/admin/customers/${r.userId}`} className="font-medium hover:underline">
                {r.email}
              </Link>
            ),
          },
          {
            key: "package",
            header: "Package",
            cell: (r) => (
              <span>
                {r.packageName}{" "}
                <span className="text-muted">({r.countryCode})</span>
              </span>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            className: "whitespace-nowrap font-medium",
            cell: (r) => formatMoney(r.amount, r.currency ?? "GBP"),
          },
          {
            key: "status",
            header: "Status",
            cell: (r) => (
              <Badge
                tone={
                  r.status === "issued"
                    ? "success"
                    : r.status === "failed" || r.status === "needs_review"
                      ? "danger"
                      : r.status === "paid" || r.status === "refund_due"
                        ? "warning"
                        : "neutral"
                }
              >
                {r.status}
              </Badge>
            ),
          },
          {
            key: "error",
            header: "Last error",
            className: "max-w-xs text-sm text-muted",
            cell: (r) => r.lastError ?? "",
          },
          {
            key: "attempts",
            header: "Attempts",
            cell: (r) => String(r.issueAttempts),
          },
          {
            key: "created",
            header: "Created",
            className: "whitespace-nowrap text-muted",
            cell: (r) => formatDateTime(r.createdAt),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (r) => <EsimOrderActions orderId={r.id} status={r.status} />,
          },
        ]}
      />
    </div>
  );
}
