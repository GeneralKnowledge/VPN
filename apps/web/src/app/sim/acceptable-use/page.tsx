import { LegalDraftNotice } from "@/components/marketing-page";

export const metadata = { title: "Acceptable use" };

export default function EsimAupPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Acceptable Use</h1>
      <LegalDraftNotice />
      <p className="mt-4 text-muted">Draft AUP for eSIM data use. Replace before launch.</p>
    </div>
  );
}
