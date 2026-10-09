import Link from "next/link";
import { brand } from "@northstar/config";
import { MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "Trust",
  description: `How ${brand.name} handles accounts, billing, and VPN access — in plain language.`,
};

export default function TrustPage() {
  return (
    <MarketingPage
      title="Trust & transparency"
      description="What you manage yourself, what we store, and how VPN access works — without slogans we cannot back up."
    >
      <div className="max-w-2xl space-y-10 text-sm text-muted">
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">Self-serve by design</h2>
          <p>
            Your dashboard is the control centre. Subscribe or cancel, download configs, manage devices, reset VPN
            credentials, open support tickets, and delete your account — without waiting on a sales call.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">What we store</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Account details you provide (email, name, password hash)</li>
            <li>Subscription and payment records needed to bill and invoice you</li>
            <li>Devices and connection labels you create in the dashboard</li>
            <li>Support messages you send us</li>
            <li>Operational audit events for security and billing disputes</li>
          </ul>
          <p>
            We do not ask you to trust marketing claims about logging. See the{" "}
            <Link href="/privacy" className="text-sea hover:underline">
              Privacy Policy
            </Link>{" "}
            for the current draft of our practices.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">How the VPN tunnel works</h2>
          <p>
            {brand.name} provisions access on managed VPN infrastructure. You connect with standard WireGuard or
            OpenVPN clients using a configuration you download (or a WireGuard QR code) from your account.
          </p>
          <p>
            Server locations and tunnel capacity come from that infrastructure. We focus on clear account control,
            billing, and setup — not unverifiable anonymity promises.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">Cancel, refunds, and deletion</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Cancel anytime from{" "}
              <Link href="/dashboard/billing" className="text-sea hover:underline">
                Billing
              </Link>
              . You keep access until the end of the paid period.
            </li>
            <li>
              Refund terms are described on the{" "}
              <Link href="/refund" className="text-sea hover:underline">
                Refunds
              </Link>{" "}
              page.
            </li>
            <li>
              Delete your account from{" "}
              <Link href="/dashboard/account" className="text-sea hover:underline">
                Account
              </Link>
              . That cancels billing and removes provisioned VPN access.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-2xl text-foreground">Questions</h2>
          <p>
            Signed-in customers can open a ticket from the dashboard. Everyone else can use{" "}
            <Link href="/contact" className="text-sea hover:underline">
              Contact
            </Link>{" "}
            or email {brand.supportEmail}.
          </p>
        </section>
      </div>
    </MarketingPage>
  );
}
