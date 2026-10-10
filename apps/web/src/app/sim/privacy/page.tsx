import { LegalDraftNotice } from "@/components/marketing-page";

export const metadata = { title: "Privacy" };

export default function EsimPrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Privacy Policy</h1>
      <LegalDraftNotice />
      <p className="mt-4 text-muted">
        Draft for the eSIM product. Replace before launch. We process account, order, and delivery data needed to
        issue your eSIM.
      </p>
    </div>
  );
}
