import { and, eq, isNull } from "drizzle-orm";
import { vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { getDb, getVpnProvider, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  connectionId: z.string().optional(),
  locationId: z.string().optional(),
  protocol: z.enum(["wireguard", "openvpn", "vless"]).optional(),
  format: z.enum(["file", "json"]).default("file"),
});

async function resolveConfig(
  userId: string,
  input: z.infer<typeof schema>,
) {
  const db = getDb();
  const account = (await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1))[0];
  if (!account || account.status !== "active") {
    throw new Error("VPN not active");
  }

  let locationId = input.locationId;
  let protocol = input.protocol ?? "wireguard";
  let connectionId = input.connectionId;
  if (connectionId) {
    const conn = (
      await db
        .select()
        .from(vpnConnections)
        .where(
          and(
            eq(vpnConnections.id, connectionId),
            eq(vpnConnections.userId, userId),
            isNull(vpnConnections.revokedAt),
          ),
        )
        .limit(1)
    )[0];
    if (!conn) throw new Error("Connection not found");
    locationId = conn.locationId;
    // Explicit protocol (e.g. OpenVPN fallback in the wizard) wins; otherwise use the connection's.
    protocol = input.protocol ?? conn.protocol;
    await db
      .update(vpnConnections)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(vpnConnections.id, conn.id));
  }
  if (!locationId) throw new Error("locationId required");

  const location = (await db.select().from(vpnLocations).where(eq(vpnLocations.id, locationId)).limit(1))[0];
  if (!location) throw new Error("Location not found");

  const vpn = getVpnProvider();
  const config = await vpn.getConnectionConfig({
    accountId: account.providerAccountId,
    locationId: location.id,
    protocol,
  });

  await writeAudit(db, {
    actorId: userId,
    actorType: "user",
    action: "config.downloaded",
    targetType: "vpn_location",
    targetId: location.id,
    correlationId: correlationId(),
    metadata: { protocol, isMock: config.isMock, format: input.format },
  });
  track({ name: "setup_started", userId, properties: { protocol, format: input.format } });

  return { config, location, protocol, connectionId };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });

    const { config, location, protocol, connectionId } = await resolveConfig(user.id, body.data);

    if (body.data.format === "json") {
      return Response.json({
        content: config.content,
        filename: config.filename,
        contentType: config.contentType,
        protocol,
        isMock: config.isMock,
        location: { id: location.id, city: location.city, country: location.country },
        connectionId: connectionId ?? null,
      });
    }

    return new Response(config.content, {
      headers: {
        "Content-Type": config.contentType,
        "Content-Disposition": `attachment; filename="${config.filename}"`,
        "X-Northstar-Mock-Config": config.isMock ? "true" : "false",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Connection not found" || message === "Location not found" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
