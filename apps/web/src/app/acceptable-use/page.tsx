import { LegalDraftNotice, MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "Acceptable Use",
  robots: { index: false, follow: false },
};

export default function AupPage() {
  return (
    <MarketingPage title="Acceptable Use Policy">
      <LegalDraftNotice />
      <div className="max-w-3xl space-y-4 text-sm text-muted">
        <p>Outline prohibited uses (abuse, unlawful activity, network attacks, spam). Finalize with counsel and align with provider AUP.</p>
      </div>
    </MarketingPage>
  );
}
