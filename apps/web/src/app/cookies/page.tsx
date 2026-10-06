import { LegalDraftNotice, MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <MarketingPage title="Cookie Policy">
      <LegalDraftNotice />
      <p className="max-w-3xl text-sm text-muted">
        This application uses essential session cookies for authentication. Analytics cookies should only be enabled when a production analytics provider is configured and disclosed here.
      </p>
    </MarketingPage>
  );
}
