import { MOCK_LOCATIONS } from "@northstar/vpn-provider";
import { MarketingPage } from "@/components/marketing-page";
import { Badge } from "@/components/ui";
import { isProduction } from "@/lib/providers";

export const metadata = { title: "Locations" };

export default function LocationsPage() {
  return (
    <MarketingPage
      title="Locations"
      description="Servers in cities around the world. Sign in to see the locations currently available on your plan."
    >
      {!isProduction() ? (
        <div className="mb-6 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Development: these cities are mock fixtures and may not reflect live servers.
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_LOCATIONS.map((loc) => (
          <div key={loc.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{loc.city}</p>
                <p className="text-sm text-muted">{loc.country}</p>
              </div>
              <Badge tone="success">{loc.status}</Badge>
            </div>
            <p className="mt-3 font-mono text-xs text-muted">{loc.protocolSupport.join(" · ")}</p>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}
