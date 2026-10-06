import { and, eq, isNull } from "drizzle-orm";
import { devices, vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { getDb, getVpnProvider, track } from "@/lib/providers";
import { correlationId, newId } from "@/lib/utils";

const createSchema = z.object({
  locationId: z.string(),
  protocol: z.enum(["wireguard", "openvpn", "vless"]).default("wireguard"),
  name: z.string().min(1).max(80),
  platform: z.enum(["windows", "macos", "linux", "ios", "android", "other"]).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db
      .select({
        id: vpnConnections.id,
        name: vpnConnections.name,
        protocol: vpnConnections.protocol,
        locationId: vpnConnections.locationId,
        city: vpnLocations.city,
        country: vpnLocations.country,
        lastUsedAt: vpnConnections.lastUsedAt,
        revokedAt: vpnConnections.revokedAt,
        createdAt: vpnConnections.createdAt,
      })
      .from(vpnConnections)
      .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
      .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));
    return Response.json({ connections: rows });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createSchema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const db = getDb();
    const account = (await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1))[0];
    if (!account || account.status !== "active") {
      return Response.json({ error: "VPN account not provisioned" }, { status: 400 });
    }
    const location = (
      await db.select().from(vpnLocations).where(eq(vpnLocations.id, body.data.locationId)).limit(1)
    )[0];
    if (!location) return Response.json({ error: "Location not found" }, { status: 404 });

    const connId = newId("conn");
    await db.insert(vpnConnections).values({
      id: connId,
      userId: user.id,
      vpnAccountId: account.id,
      locationId: location.id,
      name: body.data.name,
      protocol: body.data.protocol,
      lastUsedAt: new Date(),
    });

    if (body.data.platform) {
      await db.insert(devices).values({
        id: newId("dev"),
        userId: user.id,
        connectionId: connId,
        name: body.data.name,
        platform: body.data.platform,
        lastUsedAt: new Date(),
      });
    }

    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "connection.created",
      targetType: "vpn_connection",
      targetId: connId,
      correlationId: correlationId(),
      metadata: { locationId: location.id, protocol: body.data.protocol },
    });
    track({ name: "location_selected", userId: user.id, properties: { locationId: location.id } });
    void getVpnProvider;
    return Response.json({ id: connId });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
    const db = getDb();
    const row = (await db.select().from(vpnConnections).where(eq(vpnConnections.id, id)).limit(1))[0];
    if (!row || row.userId !== user.id) return Response.json({ error: "Not found" }, { status: 404 });
    await db.update(vpnConnections).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(vpnConnections.id, id));
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "connection.revoked",
      targetType: "vpn_connection",
      targetId: id,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
