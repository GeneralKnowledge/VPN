import { and, eq, isNull } from "drizzle-orm";
import { vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";
import { DownloadConfigButton } from "./download-button";

export default async function VpnPage() {
  const user = await requireUser();
  const db = getDb();
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  const conns = await db
    .select({
      id: vpnConnections.id,
      name: vpnConnections.name,
      protocol: vpnConnections.protocol,
      city: vpnLocations.city,
      country: vpnLocations.country,
      lastUsedAt: vpnConnections.lastUsedAt,
    })
    .from(vpnConnections)
    .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">VPN</h1>
      <Card>
        <p className="text-sm text-muted">Account status</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="font-display text-2xl">{account?.username ?? "Not provisioned"}</p>
          <Badge tone={account?.status === "active" ? "success" : "warning"}>
            {account?.status ?? "none"}
          </Badge>
        </div>
        {account?.lastError ? <p className="mt-2 text-sm text-danger">{account.lastError}</p> : null}
      </Card>
      <Card>
        <h2 className="font-display text-xl">Connections</h2>
        <ul className="mt-4 space-y-3">
          {conns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted">
                  {c.city}, {c.country} · {c.protocol}
                </p>
              </div>
              <DownloadConfigButton connectionId={c.id} />
            </li>
          ))}
          {conns.length === 0 ? <li className="text-sm text-muted">No connections yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
