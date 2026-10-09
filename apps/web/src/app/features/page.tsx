import Link from "next/link";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui";

export const metadata = {
  title: "Features",
  description: "Encrypted tunnels, location choice, device management, and self-serve billing — managed from your dashboard.",
};

export default function FeaturesPage() {
  const features = [
    {
      title: "Encrypted tunnels",
      body: "Connect with WireGuard or OpenVPN configurations generated for your account — including WireGuard QR for phones.",
    },
    {
      title: "Location choice",
      body: "Select from locations currently available on our VPN infrastructure.",
    },
    {
      title: "Device management",
      body: "Add, rename, and revoke devices within your plan limit from the dashboard.",
    },
    {
      title: "Self-serve billing",
      body: "Subscribe, view invoices, cancel at period end, or resume — all from Billing. No ticket required for routine changes.",
    },
    {
      title: "Support when you need it",
      body: "Use setup guides and FAQs first, then open a ticket from your account if you still need help.",
    },
    {
      title: "Account control",
      body: "Change your password, share a referral code, or delete your account and remove VPN access yourself.",
    },
  ];
  return (
    <MarketingPage
      title="Features"
      description="What you get with a Northstar subscription — built around self-serve control."
    >
      <div className="grid gap-8 md:grid-cols-2">
        {features.map((f) => (
          <div key={f.title}>
            <h2 className="font-display text-xl">{f.title}</h2>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/pricing">
          <Button>See pricing</Button>
        </Link>
        <Link href="/trust">
          <Button variant="secondary">Trust & transparency</Button>
        </Link>
      </div>
    </MarketingPage>
  );
}
