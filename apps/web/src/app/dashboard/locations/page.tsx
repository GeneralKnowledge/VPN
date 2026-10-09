import Link from "next/link";
import { users, vpnAccounts, vpnLocations } from "@northstar/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, getEnv, getVpnProvider } from "@/lib/providers";
import { syncLocationsFromProvider } from "@/lib/services";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { LocationBrowser } from "./location-browser";

export default async function LocationsDashPage() {
  const user = await requireUser();
  const db = getDb();
  const env = getEnv();
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  const [profile] = await db
    .select({ preferredLocationId: users.preferredLocationId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  let locations = await db.select().from(vpnLocations);
  if (
    locations.length === 0 ||
    (env.VPN_PROVIDER === "vpnresellers" && locations.every((l) => l.isFixture))
  ) {
    try {
      await syncLocationsFromProvider(db, getVpnProvider(), env.VPN_PROVIDER === "vpnresellers");
      locations = await db.select().from(vpnLocations);
    } catch {
      // keep fixtures
    }
  }

  const preferredId = profile?.preferredLocationId ?? null;
  const visible = locations
    .filter((l) => l.status !== "offline")
    .sort((a, b) => {
      if (preferredId && a.id === preferredId) return -1;
      if (preferredId && b.id === preferredId) return 1;
      return a.country.localeCompare(b.country) || a.city.localeCompare(b.city);
    });

  const canConnect = account?.status === "active";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Choose a city, name your device, then download a config. Your last-used location is listed first when available."
      />
      {!canConnect ? (
        <EmptyState
          title="Your VPN isn’t ready yet"
          description="Finish checkout or wait for setup to complete before connecting."
          action={
            <Link href="/dashboard/billing">
              <Button variant="secondary">Go to billing</Button>
            </Link>
          }
        />
      ) : null}
      <LocationBrowser
        canConnect={canConnect}
        preferredLocationId={preferredId}
        locations={visible.map((l) => ({
          id: l.id,
          city: l.city,
          country: l.country,
          countryCode: l.countryCode,
          status: l.status,
          protocols: parseProtocols(l.protocolSupportJson),
        }))}
      />
    </div>
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
