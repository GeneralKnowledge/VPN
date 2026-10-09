import { LegalDraftNotice, MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "Refund Policy",
  robots: { index: false, follow: false },
};

export default function RefundPage() {
  return (
    <MarketingPage title="Refund Policy">
      <LegalDraftNotice />
      <p className="max-w-3xl text-sm text-muted">
        Define refund windows, chargeback handling, and exceptions with counsel. No refund promises are made in this draft.
      </p>
    </MarketingPage>
  );
}
