import { eq } from "drizzle-orm";
import { vpnLocations } from "@northstar/db";
import { MOCK_LOCATIONS } from "@northstar/vpn-provider";
import { MarketingPage } from "@/components/marketing-page";
import { Badge } from "@/components/ui";
import { getDb, isProduction } from "@/lib/providers";

export const dynamic = "force-dynamic";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  let rows: Array<{
    id: string;
    city: string;
    country: string;
    status: string;
    protocolSupport: string[];
  }> = [];

  try {
    const dbRows = await getDb()
      .select()
      .from(vpnLocations)
      .where(eq(vpnLocations.status, "online"));
    rows = dbRows.map((l) => ({
      id: l.id,
      city: l.city,
      country: l.country,
      status: l.status,
      protocolSupport: parseProtocols(l.protocolSupportJson),
    }));
  } catch {
    // DB unavailable during static tooling — fall back below.
  }

  if (rows.length === 0) {
    rows = MOCK_LOCATIONS.filter((l) => l.status === "online").map((loc) => ({
      id: loc.id,
      city: loc.city,
      country: loc.country,
      status: loc.status,
      protocolSupport: loc.protocolSupport,
    }));
  }

  return (
    <MarketingPage
      title="Locations"
      description="Servers in cities around the world. Sign in to see the locations currently available on your plan."
    >
      {!isProduction() ? (
        <div className="mb-6 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Development: cities come from the local database (seeded fixtures) and may not reflect live servers.
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((loc) => (
          <div key={loc.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{loc.city}</p>
                <p className="text-sm text-muted">{loc.country}</p>
              </div>
              <Badge tone="success">{loc.status}</Badge>
            </div>
            <p className="mt-3 font-mono text-xs text-muted">{loc.protocolSupport.join(" · ")}</p>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}

function parseProtocols(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
