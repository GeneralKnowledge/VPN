import { LegalDraftNotice, MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <MarketingPage title="Terms of Service">
      <LegalDraftNotice />
      <div className="max-w-3xl space-y-4 text-sm text-muted">
        <p>Placeholder outline: service description, accounts, acceptable use, billing, limitation of liability, termination, governing law.</p>
        <p>Replace with reviewed terms before accepting paying customers.</p>
      </div>
    </MarketingPage>
  );
}
