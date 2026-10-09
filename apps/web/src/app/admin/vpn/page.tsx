import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { users, vpnAccounts } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";

export default async function AdminVpnPage() {
  await requireAdmin();
  const rows = await getDb()
    .select({
      id: vpnAccounts.id,
      username: vpnAccounts.username,
      status: vpnAccounts.status,
      provider: vpnAccounts.provider,
      createdAt: vpnAccounts.createdAt,
      updatedAt: vpnAccounts.updatedAt,
      userId: users.id,
      email: users.email,
    })
    .from(vpnAccounts)
    .innerJoin(users, eq(vpnAccounts.userId, users.id))
    .orderBy(desc(vpnAccounts.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="VPN Accounts" description="Provider accounts linked to customers." />
      <DataTable
        caption="VPN accounts"
        emptyTitle="No VPN accounts"
        rows={rows}
        rowKey={(v) => v.id}
        columns={[
          {
            key: "customer",
            header: "Customer",
            cell: (v) => (
              <Link href={`/admin/customers/${v.userId}`} className="font-medium hover:underline">
                {v.email}
              </Link>
            ),
          },
          { key: "username", header: "Username", cell: (v) => v.username },
          {
            key: "status",
            header: "Status",
            cell: (v) => (
              <Badge tone={v.status === "active" ? "success" : v.status === "error" ? "danger" : "warning"}>
                {v.status}
              </Badge>
            ),
          },
          { key: "provider", header: "Provider", cell: (v) => v.provider },
          {
            key: "updated",
            header: "Updated",
            className: "whitespace-nowrap text-muted",
            cell: (v) => formatDateTime(v.updatedAt),
          },
        ]}
      />
    </div>
  );
}
