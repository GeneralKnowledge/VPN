import { and, eq, isNull } from "drizzle-orm";
import { vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { customerErrorResponse } from "@/lib/http";
import { getDb, getVpnProvider, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  connectionId: z.string().optional(),
  locationId: z.string().optional(),
  protocol: z.enum(["wireguard", "openvpn", "vless"]).default("wireguard"),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const db = getDb();
    const account = (await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1))[0];
    if (!account || account.status !== "active") {
      return Response.json({ error: "Your VPN is not ready yet." }, { status: 400 });
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
      if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });
      locationId = conn.locationId;
      protocol = conn.protocol;
      await db
        .update(vpnConnections)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(vpnConnections.id, conn.id));
    }
    if (!locationId) return Response.json({ error: "locationId required" }, { status: 400 });

    const location = (await db.select().from(vpnLocations).where(eq(vpnLocations.id, locationId)).limit(1))[0];
    if (!location) return Response.json({ error: "Location not found" }, { status: 404 });

    const vpn = getVpnProvider();
    // Provider APIs expect server_id = providerId, not local DB id
    const config = await vpn.getConnectionConfig({
      accountId: account.providerAccountId,
      locationId: location.providerId,
      protocol,
    });

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
  } catch (err) {
    return customerErrorResponse(err, "config");
  }
}
