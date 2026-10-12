import Link from "next/link";
import { formatPrice, plans, tierMeta, type AccessTier } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Badge, Button } from "@/components/ui";

export const metadata = {
  title: "Pricing",
  description: "Access tiers from full email support to username + crypto prepaid — same VPN, different trust trade-offs.",
};

const tierOrder: AccessTier[] = ["platinum", "diamond", "gold", "bronze", "iron"];

const faqs = [
  {
    q: "Why do some plans ask for less information?",
    a: "Less personal data means stronger privacy — and less help we can give. Username-only plans cannot reset passwords by email. Iron is self-serve only.",
  },
  {
    q: "Is a crypto year the same as a Stripe year?",
    a: "No. Stripe Platinum/Diamond years renew until you cancel. Crypto (and Gold Stripe prepaid) is a one-off: you pay once and access runs until that period ends.",
  },
  {
    q: "Can I delete everything you know about me?",
    a: "Yes. Account deletion cancels billing, removes VPN access, and wipes known personal fields and support message bodies. Accounting payment rows stay without your contact details.",
  },
];

export default function PricingPage() {
  return (
    <MarketingPage
      title="Pricing & access tiers"
      description="Same locations and devices. You choose how much we know — and how much help you get."
    >
      <div className="space-y-12">
        {tierOrder.map((tier) => {
          const meta = tierMeta[tier];
          const tierPlans = plans.filter((p) => p.active && p.tier === tier);
          return (
            <section key={tier} className="space-y-4">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl text-foreground">{meta.label}</h2>
                  <Badge tone={tier === "platinum" ? "sea" : "neutral"}>{meta.supportLevel.replace("_", "-")} support</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">{meta.blurb}</p>
                <p className="mt-1 text-xs text-muted">{meta.supportNote}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {tierPlans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border border-border bg-surface p-5">
                    <p className="text-sm text-muted">
                      {plan.billingMode === "prepaid" ? "Prepaid" : "Subscription"} · {plan.paymentRail}
                    </p>
                    <p className="mt-1 font-display text-3xl">{formatPrice(plan)}</p>
                    <ul className="mt-4 space-y-1.5 text-sm text-muted">
                      {plan.features.slice(0, 4).map((f) => (
                        <li key={f}>· {f}</li>
                      ))}
                    </ul>
                    <Link href={`/register?plan=${plan.id}`} className="mt-5 inline-block">
                      <Button variant={tier === "platinum" ? "primary" : "secondary"} size="sm">
                        Get {meta.label}
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-16">
        <h2 className="font-display text-2xl">Questions</h2>
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
