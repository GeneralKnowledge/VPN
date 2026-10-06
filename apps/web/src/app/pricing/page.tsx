import Link from "next/link";
import { formatPrice, plans } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <MarketingPage
      title="Pricing"
      description="Transparent plans. Prices live in configuration and can be changed without redesigning the product."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {plans.filter((p) => p.active).map((plan) => (
          <div key={plan.id} className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-2xl">{plan.name}</h2>
            <p className="mt-2 font-display text-4xl">{formatPrice(plan)}</p>
            <p className="mt-2 text-sm text-muted">{plan.description}</p>
            <ul className="mt-6 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <Link href={`/register?plan=${plan.id}`} className="mt-6 inline-block">
              <Button>Get started</Button>
            </Link>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}
