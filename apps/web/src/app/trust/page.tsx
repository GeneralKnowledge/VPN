import Link from "next/link";
import { brand, tierMeta } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "Trust",
  description: `How ${brand.name} mixes trust with anonymity — third parties take payments and tunnels; you choose how little we keep.`,
};

export default function TrustPage() {
  return (
    <MarketingPage
      title="Trust & transparency"
      description="We treat our limits as features: we do not hold card details, crypto keys, or VPN servers. You choose how much identity to leave with us."
    >
      <div className="max-w-2xl space-y-10 text-sm text-muted">
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">Trusted third parties do the hard parts</h2>
          <p>
            Card payments go through Stripe. Crypto prepaid goes through a dedicated processor when enabled. VPN tunnels
            run on managed infrastructure. {brand.name} focuses on accounts, billing honesty, and setup — not custody of
            payment instruments or server racks.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">Access tiers: trust ↔ anonymity</h2>
          <p>
            Less information means less help. That trade-off is intentional and written on each tier.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {(["platinum", "diamond", "gold", "bronze", "iron"] as const).map((tier) => (
              <li key={tier}>
                <span className="font-medium text-foreground">{tierMeta[tier].label}</span> — {tierMeta[tier].blurb}{" "}
                <span className="text-muted">({tierMeta[tier].supportNote})</span>
              </li>
            ))}
          </ul>
          <p>
            See{" "}
            <Link href="/pricing" className="text-sea hover:underline">
              Pricing
            </Link>{" "}
            for month/year options. A crypto year is prepaid one-off access; a Stripe Platinum year renews until you
            cancel.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">What we may store</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Username and password hash (always)</li>
            <li>Email and name only when your tier asks for them</li>
            <li>Subscription / prepaid period records needed to grant access</li>
            <li>Devices and connection labels you create</li>
            <li>Support messages you send (wiped on account deletion)</li>
            <li>Operational audit events for security and billing disputes</li>
          </ul>
          <p>
            We do not invent logging slogans. See the{" "}
            <Link href="/privacy" className="text-sea hover:underline">
              Privacy Policy
            </Link>{" "}
            draft for current practices.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">Delete what we know</h2>
          <p>
            From{" "}
            <Link href="/dashboard/account" className="text-sea hover:underline">
              Account
            </Link>
            , delete your account yourself. That cancels billing, removes provisioned VPN access, clears sessions, and
            wipes known personal fields and ticket content. Payment amounts may remain for accounting without your
            contact details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">GDPR by minimisation — not magic</h2>
          <p>
            Collecting less and encouraging deletion shrinks what we hold. It does not remove every obligation for the
            data that remains (usernames, billing provider ids, audit trails). We aim to hold as little as your chosen
            tier allows — and to let you wipe it.
          </p>
        </section>
      </div>
    </MarketingPage>
  );
}
