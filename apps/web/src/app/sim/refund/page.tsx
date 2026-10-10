import { LegalDraftNotice } from "@/components/marketing-page";

export const metadata = { title: "Refunds" };

export default function EsimRefundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Refund Policy</h1>
      <LegalDraftNotice />
      <p className="mt-4 text-muted">
        Draft: unused eSIMs may be refundable before installation; installed or partially used packages generally are
        not. Replace with final policy before launch.
      </p>
    </div>
  );
}
