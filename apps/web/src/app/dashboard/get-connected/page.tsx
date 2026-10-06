import { and, eq, isNull } from "drizzle-orm";
import { vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { GetConnectedWizard } from "./wizard";

export default async function GetConnectedPage() {
  const user = await requireUser();
  const db = getDb();
  const [vpn] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  const connections = await db
    .select({
      id: vpnConnections.id,
      name: vpnConnections.name,
      protocol: vpnConnections.protocol,
      city: vpnLocations.city,
      country: vpnLocations.country,
    })
    .from(vpnConnections)
    .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Get connected</h1>
        <p className="mt-1 text-sm text-muted">
          Device → install WireGuard → import your Northstar config → connect. About three minutes on most
          devices.
        </p>
      </div>
      <GetConnectedWizard connections={connections} vpnReady={vpn?.status === "active"} />
    </div>
  );
}
