import { and, eq, isNull } from "drizzle-orm";
import { vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { customerVpnStatusLabel } from "@/lib/http";
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
      countryCode: vpnLocations.countryCode,
      lastUsedAt: vpnConnections.lastUsedAt,
    })
    .from(vpnConnections)
    .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));

  const ready = account?.status === "active";
  const label = customerVpnStatusLabel(account?.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Your VPN</h1>
        <p className="mt-1 text-sm text-muted">See whether you’re set up, and download configs for your devices.</p>
      </div>
      <Card>
        <p className="text-sm text-muted">Status</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="font-display text-2xl">{label}</p>
          <Badge tone={ready ? "success" : "warning"}>{label}</Badge>
        </div>
        {account?.status === "pending" || account?.status === "error" ? (
          <p className="mt-2 text-sm text-muted">
            We’re still setting up your access. This usually finishes within a minute — refresh shortly, or contact
            support if it persists.
          </p>
        ) : null}
        {ready ? (
          <p className="mt-2 text-sm text-muted">
            Choose a location under Locations, then download a configuration for WireGuard or OpenVPN.
          </p>
        ) : null}
      </Card>
      <Card>
        <h2 className="font-display text-xl">Active connections</h2>
        <ul className="mt-4 space-y-3">
          {conns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="font-medium">
                  <span className="mr-2" aria-hidden>
                    {flagEmoji(c.countryCode)}
                  </span>
                  {c.name}
                </p>
                <p className="text-sm text-muted">
                  {c.city}, {c.country} · {c.protocol}
                </p>
              </div>
              <DownloadConfigButton connectionId={c.id} />
            </li>
          ))}
          {conns.length === 0 ? (
            <li className="text-sm text-muted">No connections yet. Pick a location to get started.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

function flagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return "🌐";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65);
}
