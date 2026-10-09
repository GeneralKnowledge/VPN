import Link from "next/link";
import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "About",
  description: `Learn about ${brand.name} — private internet access with a clear product experience.`,
};

export default function AboutPage() {
  return (
    <MarketingPage
      title={`About ${brand.name}`}
      description="A VPN service focused on clear product experience on top of managed infrastructure."
    >
      <div className="prose-sm max-w-2xl space-y-4 text-muted">
        <p>
          {brand.name} handles accounts, billing, provisioning, devices, and support so you can encrypt your
          connection, choose a location, and get on with your day.
        </p>
        <p>
          We use managed VPN infrastructure behind a clean customer interface. Setup works with standard WireGuard
          and OpenVPN clients on the devices you already own.
        </p>
        <p>
          Questions about the company or product? Reach us via{" "}
          <Link href="/contact" className="text-sea hover:underline">
            Contact
          </Link>{" "}
          or{" "}
          <Link href="/support" className="text-sea hover:underline">
            Support
          </Link>
          .
        </p>
      </div>
    </MarketingPage>
  );
}
