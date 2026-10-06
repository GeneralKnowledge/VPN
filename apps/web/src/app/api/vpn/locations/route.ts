import { vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb, getVpnProvider } from "@/lib/providers";

export async function GET() {
  try {
    await requireUser();
    const db = getDb();
    let locations = await db.select().from(vpnLocations);
    if (locations.length === 0) {
      const remote = await getVpnProvider().listLocations();
      locations = remote.map((l) => ({
        id: l.id,
        providerId: l.providerId,
        country: l.country,
        countryCode: l.countryCode,
        city: l.city,
        region: l.region ?? null,
        hostname: l.hostname,
        status: l.status,
        protocolSupportJson: JSON.stringify(l.protocolSupport),
        latency: l.latency ?? null,
        load: l.load ?? null,
        isFixture: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }
    return Response.json({
      locations: locations.map((l) => ({
        ...l,
        protocolSupport: JSON.parse(l.protocolSupportJson) as string[],
      })),
    });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
