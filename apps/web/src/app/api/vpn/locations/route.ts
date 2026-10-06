import { vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb, getEnv, getVpnProvider } from "@/lib/providers";
import { syncLocationsFromProvider } from "@/lib/services";

export async function GET() {
  try {
    await requireUser();
    const db = getDb();
    const env = getEnv();
    let locations = await db.select().from(vpnLocations);

    const shouldSync =
      locations.length === 0 ||
      (env.VPN_PROVIDER === "vpnresellers" && locations.every((l) => l.isFixture));

    if (shouldSync) {
      try {
        await syncLocationsFromProvider(db, getVpnProvider(), env.VPN_PROVIDER === "vpnresellers");
        locations = await db.select().from(vpnLocations);
      } catch {
        // fall through with whatever we have
      }
    }

    const visible =
      env.VPN_PROVIDER === "vpnresellers"
        ? locations.filter((l) => !l.isFixture || l.status !== "offline")
        : locations;

    return Response.json({
      locations: visible
        .filter((l) => l.status !== "offline")
        .map((l) => ({
          id: l.id,
          providerId: l.providerId,
          country: l.country,
          countryCode: l.countryCode,
          city: l.city,
          region: l.region,
          hostname: l.hostname,
          status: l.status,
          protocolSupport: JSON.parse(l.protocolSupportJson) as string[],
          latency: l.latency,
          load: l.load,
        })),
    });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
