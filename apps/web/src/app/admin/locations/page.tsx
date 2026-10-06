import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { vpnLocations } from "@northstar/db";
import { Card } from "@/components/ui";

export default async function AdminLocationsPage() {
  await requireAdmin();
  const rows = await getDb().select().from(vpnLocations);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Locations</h1>
      <p className="text-sm text-muted">Fixtures are marked is_fixture=true until synced from provider.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((l) => (
          <Card key={l.id} className="text-sm">
            {l.city}, {l.country} · {l.status}
          </Card>
        ))}
      </div>
    </div>
  );
}
