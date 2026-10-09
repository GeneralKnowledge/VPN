import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { formatPrice, getPlan } from "@northstar/config";
import {
  auditEvents,
  devices,
  subscriptions,
  vpnAccounts,
  vpnConnections,
  vpnLocations,
} from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { customerVpnStatusLabel } from "@/lib/http";
import { getDb } from "@/lib/providers";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { activityLabel, subscriptionStatus } from "@/lib/labels";
import { QuickConnect } from "./quick-connect";

export default async function DashboardHome() {
  const user = await requireUser();
  const db = getDb();

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const plan = sub ? getPlan(sub.planId) : undefined;
  const [vpn] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  const deviceRows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));
  const locations = await db
    .select()
    .from(vpnLocations)
    .where(eq(vpnLocations.status, "online"))
    .limit(20);
  const recent = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.actorId, user.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(5);
  const activeConns = await db
    .select({
      id: vpnConnections.id,
      name: vpnConnections.name,
      locationId: vpnConnections.locationId,
      protocol: vpnConnections.protocol,
      city: vpnLocations.city,
      country: vpnLocations.country,
    })
    .from(vpnConnections)
    .innerJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .where(and(eq(vpnConnections.userId, user.id), isNull(vpnConnections.revokedAt)));

  const vpnReady = vpn?.status === "active";
  const maxDevices = plan?.maxDevices ?? 5;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Manage your connection, devices, and billing."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">VPN</p>
          <p className="mt-2 font-display text-2xl">{customerVpnStatusLabel(vpn?.status)}</p>
          <Badge tone={vpnReady ? "success" : "warning"}>{customerVpnStatusLabel(vpn?.status)}</Badge>
        </Card>
        <Card>
          <p className="text-sm text-muted">Plan</p>
          <p className="mt-2 font-display text-2xl">{plan?.name ?? "No plan"}</p>
          <p className="text-sm text-muted">
            {plan ? formatPrice(plan) : "Choose a plan to provision VPN access"}
            {sub ? ` · ${subscriptionStatus(sub.status).label}` : ""}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Active devices</p>
          <p className="mt-2 font-display text-2xl">
            {deviceRows.length} / {maxDevices}
          </p>
          <Link href="/dashboard/devices" className="text-sm text-sea hover:underline">
            Manage devices
          </Link>
        </Card>
      </div>

      <Card>
        <h2 className="font-display text-xl">Quick Connect</h2>
        <p className="mt-1 text-sm text-muted">Pick a location and download a configuration for your device.</p>
        {vpnReady ? (
          <QuickConnect
            locations={locations.map((l) => ({
              id: l.id,
              city: l.city,
              country: l.country,
              countryCode: l.countryCode,
            }))}
            connections={activeConns.map((c) => ({ id: c.id, locationId: c.locationId, protocol: c.protocol }))}
          />
        ) : (
          <div className="mt-4">
            <Link href="/dashboard/billing">
              <Button>Subscribe to get VPN access</Button>
            </Link>
          </div>
        )}
        <Link href="/dashboard/locations" className="mt-4 inline-block text-sm text-sea hover:underline">
          View all locations
        </Link>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg">Your connections</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {activeConns.length === 0 ? (
              <li>
                <EmptyState title="No connections yet" description="Use Quick Connect above to create your first one." />
              </li>
            ) : (
              activeConns.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span className="text-muted">
                    {c.city}, {c.country}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-lg">Recent activity</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {recent.length === 0 ? (
              <li>
                <EmptyState title="Nothing here yet" description="Your recent account activity will show up here." />
              </li>
            ) : (
              recent.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>{activityLabel(e.action)}</span>
                  <span className="shrink-0 text-muted">{formatDateTime(e.createdAt)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
