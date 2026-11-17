import type { Metadata } from "next";
import { travelBrand } from "@northstar/config";
import { TravelSiteChrome } from "@/components/travel-site-chrome";
import { getSessionUser } from "@/lib/auth";
import { appUrl } from "@/lib/providers";

// URLs come from the runtime env (TRAVEL_APP_URL etc.), not the build machine.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    // Canonical and Open Graph URLs on this host resolve against the Travel URL, not the VPN one.
    metadataBase: new URL(appUrl("travel")),
    title: { default: travelBrand.name, template: `%s · ${travelBrand.name}` },
    description: travelBrand.tagline,
    applicationName: travelBrand.name,
    openGraph: {
      type: "website",
      siteName: travelBrand.name,
      title: travelBrand.name,
      description: travelBrand.tagline,
      locale: "en_GB",
    },
  };
}

export default async function TravelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <TravelSiteChrome authed={Boolean(user)} esimUrl={appUrl("esim")} vpnUrl={appUrl("vpn")}>
      {children}
    </TravelSiteChrome>
  );
}
