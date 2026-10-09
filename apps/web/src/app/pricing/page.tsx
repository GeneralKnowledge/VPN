import Link from "next/link";
import { formatPrice, plans } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Badge, Button } from "@/components/ui";

export const metadata = {
  title: "Pricing",
  description: "Simple transparent VPN plans. Monthly or annual billing, cancel anytime from your dashboard.",
};

const faqs = [
  {
    q: "Can I switch between monthly and annual later?",
    a: "Yes. Choose a plan at signup, then manage billing from your dashboard. Switching plans follows your current billing period.",
  },
  {
    q: "What happens if I cancel?",
    a: "You keep access until the end of the paid period. After that, VPN provisioning stops and configs stop working.",
  },
  {
    q: "How many devices can I use?",
    a: "Both plans include up to five devices. Rename or revoke devices anytime from the dashboard.",
  },
];

export default function PricingPage() {
  const active = plans.filter((p) => p.active);
  const monthly = active.find((p) => p.billingInterval === "month");
  const annual = active.find((p) => p.billingInterval === "year");
  const annualMonthly = annual ? annual.price / 12 / 100 : null;
  const savingsPct =
    monthly && annual
      ? Math.round((1 - annual.price / (monthly.price * 12)) * 100)
      : null;

  return (
    <MarketingPage
      title="Pricing"
      description="Simple, transparent plans. Cancel anytime from your dashboard."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {active.map((plan) => {
          const featured = plan.billingInterval === "year";
          return (
            <div
              key={plan.id}
              className={
                featured
                  ? "relative rounded-2xl border-2 border-sea bg-surface p-6 shadow-sm"
                  : "rounded-2xl border border-border bg-surface p-6"
              }
            >
              {featured && savingsPct != null && savingsPct > 0 ? (
                <Badge tone="sea" className="absolute -top-3 right-4">
                  Save about {savingsPct}%
                </Badge>
              ) : null}
              <h2 className="font-display text-2xl">{plan.name}</h2>
              <p className="mt-2 font-display text-4xl">{formatPrice(plan)}</p>
              {featured && annualMonthly != null ? (
                <p className="mt-1 text-sm text-muted">About £{annualMonthly.toFixed(2)}/month, billed yearly</p>
              ) : null}
              <p className="mt-2 text-sm text-muted">{plan.description}</p>
              <ul className="mt-6 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-sea" aria-hidden>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/register?plan=${plan.id}`} className="mt-6 inline-block">
                <Button variant={featured ? "primary" : "secondary"}>Get started</Button>
              </Link>
            </div>
          );
        })}
      </div>

      <section className="mt-16">
        <h2 className="font-display text-2xl">Pricing questions</h2>
        <dl className="mt-6 space-y-6">
          {faqs.map((item) => (
            <div key={item.q}>
              <dt className="font-medium">{item.q}</dt>
              <dd className="mt-1 text-sm text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </MarketingPage>
  );
}
