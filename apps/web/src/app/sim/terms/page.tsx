import { LegalDraftNotice } from "@/components/marketing-page";

export const metadata = { title: "Terms" };

export default function EsimTermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Terms of Service</h1>
      <LegalDraftNotice />
      <p className="mt-4 text-muted">Draft terms for one-time eSIM data packages. Replace before launch.</p>
    </div>
  );
}
