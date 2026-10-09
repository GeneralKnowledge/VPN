import { asc } from "drizzle-orm";
import { vpnLocations } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { flagEmoji } from "@/lib/format";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, PageHeader } from "@/components/ui";

export default async function AdminLocationsPage() {
  await requireAdmin();
  const rows = await getDb().select().from(vpnLocations).orderBy(asc(vpnLocations.country), asc(vpnLocations.city));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Server locations available to customers. Fixture rows are replaced when the live provider syncs."
      />
      <DataTable
        caption="VPN locations"
        emptyTitle="No locations"
        rows={rows}
        rowKey={(l) => l.id}
        columns={[
          {
            key: "location",
            header: "Location",
            cell: (l) => (
              <span>
                <span className="mr-2" aria-hidden>
                  {flagEmoji(l.countryCode)}
                </span>
                {l.city}, {l.country}
              </span>
            ),
          },
          { key: "hostname", header: "Hostname", className: "font-mono text-xs", cell: (l) => l.hostname },
          {
            key: "status",
            header: "Status",
            cell: (l) => (
              <Badge tone={l.status === "online" ? "success" : l.status === "offline" ? "danger" : "warning"}>
                {l.status}
              </Badge>
            ),
          },
          {
            key: "protocols",
            header: "Protocols",
            cell: (l) => {
              try {
                return (JSON.parse(l.protocolSupportJson) as string[]).join(", ");
              } catch {
                return "—";
              }
            },
          },
          {
            key: "fixture",
            header: "Source",
            cell: (l) => (l.isFixture ? <Badge>Fixture</Badge> : <Badge tone="sea">Provider</Badge>),
          },
        ]}
      />
    </div>
  );
}
