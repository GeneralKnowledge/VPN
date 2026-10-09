import { and, eq, isNull } from "drizzle-orm";
import { devices, vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getDb, track } from "@/lib/providers";
import { MAX_CONNECTIONS_PER_USER, assertDeviceCapacity } from "@/lib/services";
import { correlationId, newId } from "@/lib/utils";

const createSchema = z.object({
  locationId: z.string().min(1),
  protocol: z.enum(["wireguard", "openvpn", "vless"]).default("wireguard"),
  name: z.string().trim().min(1).max(80),
  /** Required — every connection is a named device for plan limits and the dashboard. */
  platform: z.enum(["windows", "macos", "linux", "ios", "android", "other"]),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await getDb()
      .select({
        id: vpnConnections.id,
        name: vpnConnections.name,
        protocol: vpnConnections.protocol,
        locationId: vpnConnections.locationId,
        city: vpnLocations.city,
        country: vpnLocations.country,
        countryCode: vpnLocations.countryCode,
        lastUsedAt: vpnConnections.lastUsedAt,
        revokedAt: vpnConnections.revokedAt,
        createdAt: vpnConnections.createdAt,
      })
      .from(vpnConnections)
      .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
      .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));
    return Response.json({ connections: rows });
  });
}

export async function POST(req: Request) {
  return handle(
    async () => {
      const user = await requireUser();
      const body = await parseBody(req, createSchema);
      const db = getDb();
      const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
      if (!account || account.status !== "active") {
        throw new HttpError(400, "Your VPN is not ready yet. Please try again shortly.");
      }
      const [location] = await db.select().from(vpnLocations).where(eq(vpnLocations.id, body.locationId)).limit(1);
      if (!location) throw new HttpError(404, "Location not found");
      if (location.status === "offline") throw new HttpError(400, "That location is temporarily unavailable.");
      const supported = JSON.parse(location.protocolSupportJson) as string[];
      if (!supported.includes(body.protocol)) {
        throw new HttpError(400, "That protocol isn't available at this location.");
      }

      const existing = await db
        .select({ id: vpnConnections.id })
        .from(vpnConnections)
        .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));
      if (existing.length >= MAX_CONNECTIONS_PER_USER) {
        throw new HttpError(400, "You have reached the connection limit. Remove one you no longer use.");
      }
      await assertDeviceCapacity(db, user.id);

      const connId = newId("conn");
      await db.insert(vpnConnections).values({
        id: connId,
        userId: user.id,
        vpnAccountId: account.id,
        locationId: location.id,
        name: body.name,
        protocol: body.protocol,
      });
      await db.insert(devices).values({
        id: newId("dev"),
        userId: user.id,
        connectionId: connId,
        name: body.name,
        platform: body.platform,
      });

      await writeAudit(db, {
        actorId: user.id,
        actorType: "user",
        action: "connection.created",
        targetType: "vpn_connection",
        targetId: connId,
        correlationId: correlationId(),
        metadata: { locationId: location.id, protocol: body.protocol, platform: body.platform },
      });
      track({ name: "location_selected", userId: user.id, properties: { locationId: location.id } });
      return Response.json({ id: connId });
    },
    { kind: "connection" },
  );
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id");
    const db = getDb();
    const [row] = await db.select().from(vpnConnections).where(eq(vpnConnections.id, id)).limit(1);
    if (!row || row.userId !== user.id) throw new HttpError(404, "Not found");
    const now = new Date();
    await db.update(vpnConnections).set({ revokedAt: now, updatedAt: now }).where(eq(vpnConnections.id, id));
    await db
      .update(devices)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(devices.connectionId, id), eq(devices.userId, user.id), isNull(devices.revokedAt)));
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "connection.revoked",
      targetType: "vpn_connection",
      targetId: id,
    });
    return Response.json({ ok: true });
  });
}
