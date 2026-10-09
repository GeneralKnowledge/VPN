import { MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "Features",
  description: "Encrypted tunnels, location choice, device management, self-serve billing, and email support.",
};

export default function FeaturesPage() {
  const features = [
    {
      title: "Encrypted tunnels",
      body: "Connect with WireGuard or OpenVPN configurations generated for your account.",
    },
    {
      title: "Location choice",
      body: "Select from locations currently available on our VPN infrastructure.",
    },
    {
      title: "Device management",
      body: "Add, rename, and revoke devices within your plan limit.",
    },
    {
      title: "Self-serve billing",
      body: "Subscribe, cancel at period end, or resume from your dashboard.",
    },
    {
      title: "Support when you need it",
      body: "Open a ticket from your account dashboard and track replies in one place.",
    },
    {
      title: "Referrals",
      body: "Share a personal referral code with friends from your account.",
    },
  ];
  return (
    <MarketingPage title="Features" description="What you get with a Northstar subscription.">
      <div className="grid gap-8 md:grid-cols-2">
        {features.map((f) => (
          <div key={f.title}>
            <h2 className="font-display text-xl">{f.title}</h2>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}
