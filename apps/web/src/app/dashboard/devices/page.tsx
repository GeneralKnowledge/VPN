import { and, eq, isNull } from "drizzle-orm";
import { devices, plans, subscriptions, vpnLocations, vpnConnections } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { DeviceActions } from "./device-actions";

export default async function DevicesPage() {
  const user = await requireUser();
  const db = getDb();
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      platform: devices.platform,
      lastUsedAt: devices.lastUsedAt,
      city: vpnLocations.city,
      country: vpnLocations.country,
    })
    .from(devices)
    .leftJoin(vpnConnections, eq(devices.connectionId, vpnConnections.id))
    .leftJoin(vpnLocations, eq(vpnConnections.locationId, vpnLocations.id))
    .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
  const [plan] = sub
    ? await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1)
    : [undefined];

  return (
    <div className="space-y-6">
      <PageHeader title="Devices" description={`${rows.length} / ${plan?.maxDevices ?? 5} devices on your plan`} />
      <DeviceActions />
      <div className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState
            title="No devices yet"
            description="Add the phone, laptop or tablet you want to protect using the form above."
          />
        ) : null}
        {rows.map((d) => (
          <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{d.name}</p>
              <p className="text-sm text-muted">
                {d.platform}
                {d.city ? ` · ${d.city}, ${d.country}` : ""}
                {d.lastUsedAt ? ` · Last active ${formatDateTime(d.lastUsedAt)}` : ""}
              </p>
            </div>
            <DeviceActions deviceId={d.id} name={d.name} />
          </Card>
        ))}
      </div>
    </div>
  );
}
