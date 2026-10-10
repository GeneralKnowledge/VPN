import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getPlan, resolveLocationCoords } from "@northstar/config";
import { devices, subscriptions, users, vpnAccounts, vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb, getEnv, getVpnProvider } from "@/lib/providers";
import { syncLocationsFromProvider } from "@/lib/services";
import { Button, PageHeader } from "@/components/ui";
import { SetupWizard } from "./setup-wizard";

export const metadata = {
  title: "Set up this device",
};

export default async function SetupDevicePage() {
  const user = await requireUser();
  const db = getDb();
  const env = getEnv();

  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);
  const plan = sub ? getPlan(sub.planId) : undefined;
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
      /* keep fixtures */
    }
  }

  const deviceRows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));
  const activeDeviceCount = deviceRows.filter((d) => d.connectionId != null).length;
  const maxDevices = plan?.maxDevices ?? 5;
  const deviceLimitReached = activeDeviceCount >= maxDevices;

  const preferredId = profile?.preferredLocationId ?? null;
  const mapLocations = locations
    .filter((l) => l.status === "online")
    .map((l) => {
      const coords =
        l.latitude != null && l.longitude != null
          ? { latitude: l.latitude, longitude: l.longitude }
          : resolveLocationCoords(l.countryCode, l.city);
      return {
        id: l.id,
        city: l.city,
        country: l.country,
        countryCode: l.countryCode,
        latitude: coords.latitude,
        longitude: coords.longitude,
        status: l.status,
        protocols: parseProtocols(l.protocolSupportJson),
      };
    })
    .sort((a, b) => {
      if (preferredId && a.id === preferredId) return -1;
      if (preferredId && b.id === preferredId) return 1;
      return a.country.localeCompare(b.country) || a.city.localeCompare(b.city);
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Set up this device"
        description="Install WireGuard, pick a location on the map, then import your config — the shortest path from zero to connected."
        actions={
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              Back to dashboard
            </Button>
          </Link>
        }
      />
      <SetupWizard
        canConnect={account?.status === "active"}
        preferredLocationId={preferredId}
        deviceLimitReached={deviceLimitReached}
        locations={mapLocations}
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
