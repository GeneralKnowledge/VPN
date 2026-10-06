import { MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "Features" };

export default function FeaturesPage() {
  const features = [
    { title: "Encrypted tunnels", body: "Connect with WireGuard or OpenVPN configurations generated for your account." },
    { title: "Location choice", body: "Select from locations exposed by the configured infrastructure provider." },
    { title: "Device management", body: "Add, rename, and revoke devices within your plan limit." },
    { title: "Self-serve billing", body: "Subscribe, cancel at period end, or resume from your dashboard." },
    { title: "Support tickets", body: "Contact the team without third-party helpdesk accounts in development." },
    { title: "Referrals", body: "Share your code. Every few paying friends earns you a free month of Premium — plus a light leaderboard." },
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
