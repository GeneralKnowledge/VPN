import { LegalDraftNotice, MarketingPage } from "@/components/marketing-page";

export const metadata = {
  title: "Cookie Policy",
  robots: { index: false, follow: false },
};

export default function CookiesPage() {
  return (
    <MarketingPage title="Cookie Policy">
      <LegalDraftNotice />
      <p className="max-w-3xl text-sm text-muted">
        This application uses essential session cookies for authentication. Analytics cookies should only be enabled when a production analytics provider is configured and disclosed here.
      </p>
      <p className="mt-4 max-w-3xl text-sm text-muted">
        Travel partner links are counted on our server when you follow one; that sets no cookie. A
        partner&apos;s own site may set its cookies once you arrive there, under that partner&apos;s notice. We
        load no partner scripts or pixels on our pages.
      </p>
    </MarketingPage>
  );
}
