import { devices, vpnConnections, vpnLocations, type Db } from "@northstar/db";
import { and, eq, isNull } from "drizzle-orm";
import { newId } from "./utils";

/**
 * Ensure the user has at least one active WireGuard connection after provisioning.
 * Prefers a GB (UK) online location when available so first-connect is one download away.
 */
export async function ensureDefaultWireGuardConnection(
  db: Db,
  userId: string,
  vpnAccountId: string,
): Promise<string | null> {
  const existing = await db
    .select({ id: vpnConnections.id })
    .from(vpnConnections)
    .where(and(eq(vpnConnections.userId, userId), isNull(vpnConnections.revokedAt)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const locations = await db.select().from(vpnLocations).where(eq(vpnLocations.status, "online"));
  const preferred =
    locations.find((l) => l.countryCode === "GB") ??
    locations.find((l) => {
      try {
        const protocols = JSON.parse(l.protocolSupportJson) as string[];
        return protocols.includes("wireguard");
      } catch {
        return true;
      }
    }) ??
    locations[0];

  if (!preferred) return null;

  const connId = newId("conn");
  const name = `${preferred.city} · WireGuard`;

  await db.insert(vpnConnections).values({
    id: connId,
    userId,
    vpnAccountId,
    locationId: preferred.id,
    name,
    protocol: "wireguard",
    lastUsedAt: new Date(),
  });

  await db.insert(devices).values({
    id: newId("dev"),
    userId,
    connectionId: connId,
    name: "Primary device",
    platform: "other",
    lastUsedAt: new Date(),
  });

  return connId;
}
