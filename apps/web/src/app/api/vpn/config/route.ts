import { and, eq, isNull } from "drizzle-orm";
import { users, vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getDb, getVpnProvider, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  connectionId: z.string().optional(),
  locationId: z.string().optional(),
  protocol: z.enum(["wireguard", "openvpn", "vless"]).default("wireguard"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await parseBody(req, schema);
    const body = { data: input };
    const db = getDb();
    const account = (await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1))[0];
    if (!account || account.status !== "active") {
      throw new HttpError(400, "Your VPN is not ready yet.");
    }

    let locationId = body.data.locationId;
    let protocol = body.data.protocol;
    if (body.data.connectionId) {
      const conn = (
        await db
          .select()
          .from(vpnConnections)
          .where(
            and(
              eq(vpnConnections.id, body.data.connectionId),
              eq(vpnConnections.userId, user.id),
              isNull(vpnConnections.revokedAt),
            ),
          )
          .limit(1)
      )[0];
      if (!conn) throw new HttpError(404, "Connection not found");
      locationId = conn.locationId;
      protocol = conn.protocol;
      await db
        .update(vpnConnections)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(vpnConnections.id, conn.id));
    }
    if (!locationId) throw new HttpError(400, "locationId required");

    const location = (await db.select().from(vpnLocations).where(eq(vpnLocations.id, locationId)).limit(1))[0];
    if (!location) throw new HttpError(404, "Location not found");
    if (location.status === "offline") throw new HttpError(400, "That location is temporarily unavailable.");
    if (!(JSON.parse(location.protocolSupportJson) as string[]).includes(protocol)) {
      throw new HttpError(400, "That protocol isn't available at this location.");
    }

    const vpn = getVpnProvider();
    // Provider APIs expect server_id = providerId, not local DB id
    const config = await vpn.getConnectionConfig({
      accountId: account.providerAccountId,
      locationId: location.providerId,
      protocol,
    });

    await db
      .update(users)
      .set({ preferredLocationId: location.id, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "config.downloaded",
      targetType: "vpn_location",
      targetId: location.id,
      correlationId: correlationId(),
      metadata: { protocol, isMock: config.isMock },
    });
    track({ name: "setup_started", userId: user.id, properties: { protocol } });

    return new Response(config.content, {
      headers: {
        "Content-Type": config.contentType,
        "Content-Disposition": `attachment; filename="${config.filename}"`,
        "X-Northstar-Mock-Config": config.isMock ? "true" : "false",
        "Cache-Control": "no-store",
      },
    });
  }, { kind: "config" });
}
