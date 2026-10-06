import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <MarketingPage
      title={`About ${brand.name}`}
      description="A small VPN company focused on clear product experience on top of managed infrastructure."
    >
      <div className="prose-sm max-w-2xl space-y-4 text-muted">
        <p>
          {brand.name} is a placeholder brand for a launch-ready white-label VPN business. The product
          handles accounts, billing, provisioning, devices, and support while VPN servers are operated by
          a provider behind a clean interface.
        </p>
        <p>
          Replace this page with your company story, jurisdiction, and ownership details before launch.
        </p>
      </div>
    </MarketingPage>
  );
}
