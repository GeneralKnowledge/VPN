import Link from "next/link";
import { vpnAccounts, vpnLocations } from "@northstar/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, getEnv, getVpnProvider } from "@/lib/providers";
import { syncLocationsFromProvider } from "@/lib/services";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { CreateConnectionForm } from "./create-form";
import { flagEmoji } from "@/lib/format";


export default async function LocationsDashPage() {
  const user = await requireUser();
  const db = getDb();
  const env = getEnv();
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);

  let locations = await db.select().from(vpnLocations);
  if (
    locations.length === 0 ||
    (env.VPN_PROVIDER === "vpnresellers" && locations.every((l) => l.isFixture))
  ) {
    try {
      await syncLocationsFromProvider(db, getVpnProvider(), env.VPN_PROVIDER === "vpnresellers");
      locations = await db.select().from(vpnLocations);
    } catch {
      // keep fixtures
    }
  }

  const visible = locations.filter((l) => l.status !== "offline");

  return (
    <div className="space-y-6">
      <PageHeader title="Locations" description="Choose a city, then connect. Configs download for your device." />
      {account?.status !== "active" ? (
        <EmptyState
          title="Your VPN isn’t ready yet"
          description="Finish checkout or wait for setup to complete before connecting."
          action={
            <Link href="/dashboard/billing">
              <Button variant="secondary">Go to billing</Button>
            </Link>
          }
        />
      ) : (
        <CreateConnectionForm
          locations={visible.map((l) => ({
            id: l.id,
            label: `${flagEmoji(l.countryCode)} ${l.country} — ${l.city}`,
            countryCode: l.countryCode,
            city: l.city,
            country: l.country,
          }))}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((l) => (
          <Card key={l.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">
                  <span className="mr-2" aria-hidden>
                    {flagEmoji(l.countryCode)}
                  </span>
                  {l.city}
                </p>
                <p className="text-sm text-muted">{l.country}</p>
              </div>
              <Badge tone={l.status === "online" ? "success" : "warning"}>{l.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
