import { MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <MarketingPage
      title="Support"
      description="Account holders can open tickets from the dashboard. For general questions before signup, use the contact form."
    >
      <div className="space-y-4 text-sm text-muted">
        <p>Common topics: setup instructions, billing changes, device limits, and connection troubleshooting.</p>
        <p>
          Signed-in customers: go to <a className="text-sea underline" href="/dashboard/support">Dashboard → Support</a>.
        </p>
        <p>
          Everyone else: <a className="text-sea underline" href="/contact">Contact</a>.
        </p>
      </div>
    </MarketingPage>
  );
}
