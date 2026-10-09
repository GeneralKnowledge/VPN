import Link from "next/link";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui";

export const metadata = {
  title: "Support",
  description: "Self-serve setup and billing help, plus tickets for signed-in customers.",
};

const faqs = [
  {
    q: "How do I connect on my phone or laptop?",
    a: "Download a WireGuard or OpenVPN config from Your VPN (or scan the WireGuard QR), then follow the setup guide for your platform.",
  },
  {
    q: "How do I cancel?",
    a: "Open Dashboard → Billing and cancel. You keep access until the end of the paid period. You can resume before then if you change your mind.",
  },
  {
    q: "How many devices can I use?",
    a: "Premium includes up to five devices. Rename or revoke devices anytime from Dashboard → Devices.",
  },
  {
    q: "Payment failed — what now?",
    a: "Check Billing for status and invoices. Update your payment method with your card issuer if needed, then retry or contact support from the dashboard.",
  },
];

export default function SupportPage() {
  return (
    <MarketingPage
      title="Support"
      description="Start with self-serve guides and FAQs. Signed-in customers can open a ticket from the dashboard."
    >
      <div className="flex flex-wrap gap-3">
        <Link href="/download">
          <Button>Setup guides</Button>
        </Link>
        <Link href="/dashboard/support">
          <Button variant="secondary">Open a ticket</Button>
        </Link>
        <Link href="/contact">
          <Button variant="ghost">Contact before signup</Button>
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Common questions</h2>
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
