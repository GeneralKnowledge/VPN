import { LegalDraftNotice } from "@/components/marketing-page";

export const metadata = { title: "Cookies" };

export default function EsimCookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Cookies</h1>
      <LegalDraftNotice />
      <p className="mt-4 text-muted">Draft cookie notice for the eSIM site. Replace before launch.</p>
    </div>
  );
}
