import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { users, vpnConnections, vpnLocations } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";

export default async function AdminConnectionsPage() {
  await requireAdmin();
  const rows = await getDb()
    .select({
      id: vpnConnections.id,
      name: vpnConnections.name,
      protocol: vpnConnections.protocol,
      createdAt: vpnConnections.createdAt,
      revokedAt: vpnConnections.revokedAt,
      userId: users.id,
      email: users.email,
      city: vpnLocations.city,
      country: vpnLocations.country,
    })
    .from(vpnConnections)
    .innerJoin(users, eq(vpnConnections.userId, users.id))
    .leftJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .orderBy(desc(vpnConnections.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Connections" description="Customer VPN connections across locations." />
      <DataTable
        caption="Connections"
        emptyTitle="No connections"
        rows={rows}
        rowKey={(c) => c.id}
        columns={[
          {
            key: "customer",
            header: "Customer",
            cell: (c) => (
              <Link href={`/admin/customers/${c.userId}`} className="font-medium hover:underline">
                {c.email}
              </Link>
            ),
          },
          { key: "name", header: "Name", cell: (c) => c.name },
          {
            key: "location",
            header: "Location",
            cell: (c) => (c.city ? `${c.city}, ${c.country}` : "—"),
          },
          { key: "protocol", header: "Protocol", cell: (c) => c.protocol },
          {
            key: "status",
            header: "Status",
            cell: (c) => (
              <Badge tone={c.revokedAt ? "neutral" : "success"}>{c.revokedAt ? "Revoked" : "Active"}</Badge>
            ),
          },
          {
            key: "created",
            header: "Created",
            className: "whitespace-nowrap text-muted",
            cell: (c) => formatDateTime(c.createdAt),
          },
        ]}
      />
    </div>
  );
}
