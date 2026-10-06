import { MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "How it works" };

export default function HowItWorksPage() {
  const steps = [
    { title: "Create an account", body: "Register with email and password. Verify your email in production flows." },
    { title: "Choose a plan", body: "Monthly or annual Premium. Checkout runs through the billing provider abstraction." },
    { title: "Automatic provisioning", body: "After payment succeeds, a VPN account is created via the VPN provider interface." },
    { title: "Connect", body: "Pick a location, create a device, download a configuration, and connect with a standard client." },
  ];
  return (
    <MarketingPage title="How it works" description="From signup to an encrypted connection.">
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
    </MarketingPage>
  );
}
