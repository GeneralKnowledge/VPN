import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { payments, users } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const rows = await getDb()
    .select({
      id: payments.id,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      provider: payments.provider,
      createdAt: payments.createdAt,
      userId: users.id,
      email: users.email,
    })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .orderBy(desc(payments.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Recorded payment attempts and charges." />
      <DataTable
        caption="Payments"
        emptyTitle="No payments yet"
        rows={rows}
        rowKey={(p) => p.id}
        columns={[
          {
            key: "customer",
            header: "Customer",
            cell: (p) => (
              <Link href={`/admin/customers/${p.userId}`} className="font-medium hover:underline">
                {p.email}
              </Link>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            className: "whitespace-nowrap font-medium",
            cell: (p) => formatMoney(p.amount, p.currency ?? "GBP"),
          },
          {
            key: "status",
            header: "Status",
            cell: (p) => (
              <Badge tone={p.status === "succeeded" ? "success" : p.status === "failed" ? "danger" : "warning"}>
                {p.status}
              </Badge>
            ),
          },
          { key: "provider", header: "Provider", cell: (p) => p.provider },
          {
            key: "created",
            header: "Created",
            className: "whitespace-nowrap text-muted",
            cell: (p) => formatDateTime(p.createdAt),
          },
        ]}
      />
    </div>
  );
}
