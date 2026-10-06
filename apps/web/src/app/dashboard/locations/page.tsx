import { vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";
import { CreateConnectionForm } from "./create-form";

export default async function LocationsDashPage() {
  await requireUser();
  const db = getDb();
  const locations = await db.select().from(vpnLocations);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Locations</h1>
        <p className="mt-1 text-sm text-muted">
          Fixture locations for development. Live inventory comes from the VPN provider in production.
        </p>
      </div>
      <CreateConnectionForm locations={locations.map((l) => ({ id: l.id, label: `${l.city}, ${l.country}` }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        {locations.map((l) => (
          <Card key={l.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{l.city}</p>
                <p className="text-sm text-muted">{l.country}</p>
              </div>
              <Badge tone={l.status === "online" ? "success" : "warning"}>{l.status}</Badge>
            </div>
            <p className="mt-3 font-mono text-xs text-muted">{l.protocolSupportJson}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
