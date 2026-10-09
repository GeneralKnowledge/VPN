import Link from "next/link";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui";

export const metadata = {
  title: "How it works",
  description: "Create an account, choose a plan, download a config, and connect with WireGuard or OpenVPN.",
};

export default function HowItWorksPage() {
  const steps = [
    {
      title: "Create an account",
      body: "Register with your email and password. You can manage everything from your dashboard after you sign in.",
    },
    {
      title: "Choose a plan",
      body: "Pick monthly or annual Premium and complete checkout. Cancel anytime from Billing — you keep access until the period ends.",
    },
    {
      title: "Get VPN access",
      body: "After payment succeeds, your VPN access is prepared automatically. When status shows Ready, you can pick a location.",
    },
    {
      title: "Connect on your device",
      body: "Create a connection, download a WireGuard or OpenVPN config (or scan the WireGuard QR), and import it into the official client for your device.",
    },
  ];

  return (
    <MarketingPage
      title="How it works"
      description="From signup to an encrypted connection — self-serve, with standard apps you already trust."
    >
      <ol className="space-y-8">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="font-display text-3xl text-accent">{i + 1}</span>
            <div>
              <h2 className="font-display text-xl">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/register">
          <Button>Get started</Button>
        </Link>
        <Link href="/download">
          <Button variant="secondary">Setup guides</Button>
        </Link>
        <Link href="/trust">
          <Button variant="ghost">Trust & transparency</Button>
        </Link>
      </div>
    </MarketingPage>
  );
}
