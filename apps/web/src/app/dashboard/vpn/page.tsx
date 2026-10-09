import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { devices, vpnAccounts, vpnConnections, vpnLocations } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { customerVpnStatusLabel } from "@/lib/http";
import { getDb } from "@/lib/providers";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { flagEmoji } from "@/lib/format";
import { ResetCredentialsButton } from "./credentials-button";
import { DownloadConfigButton } from "./download-button";
import { ConnectionActions } from "./connection-actions";

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
      platform: devices.platform,
      deviceId: devices.id,
    })
    .from(vpnConnections)
    .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .leftJoin(
      devices,
      and(eq(devices.connectionId, vpnConnections.id), isNull(devices.revokedAt)),
    )
    .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));

  const ready = account?.status === "active";
  const label = customerVpnStatusLabel(account?.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your devices"
        description="Each device is a named connection: download a config or WireGuard QR, rename, or remove it here."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/locations">
              <Button size="sm">Add device</Button>
            </Link>
            <Link href="/download">
              <Button size="sm" variant="secondary">
                Setup guides
              </Button>
            </Link>
          </div>
        }
      />
      <Card>
        <p className="text-sm text-muted">VPN status</p>
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
            Add a device from Locations, then download a WireGuard or OpenVPN configuration for that device.
          </p>
        ) : null}
        {ready ? <ResetCredentialsButton /> : null}
      </Card>
      <Card>
        <h2 className="font-display text-xl">Active devices</h2>
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
                  {c.platform ? ` · ${c.platform}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <DownloadConfigButton connectionId={c.id} protocol={c.protocol} />
                <ConnectionActions connectionId={c.id} name={c.name} />
              </div>
            </li>
          ))}
          {conns.length === 0 ? (
            <li>
              <EmptyState
                title="No devices yet"
                description="Pick a location, name your device, and download a configuration to get started."
                action={
                  <Link href="/dashboard/locations">
                    <Button size="sm">Browse locations</Button>
                  </Link>
                }
              />
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
