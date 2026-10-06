import { LegalDraftNotice, MarketingPage } from "@/components/marketing-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <MarketingPage title="Privacy Policy">
      <LegalDraftNotice />
      <div className="max-w-3xl space-y-4 text-sm text-muted">
        <p>Sections to complete with counsel before launch:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>What account data is collected</li>
          <li>What billing data processors receive</li>
          <li>What the VPN infrastructure provider processes</li>
          <li>Retention and deletion</li>
          <li>International transfers</li>
          <li>User rights and contact for privacy requests</li>
        </ul>
        <p>Until reviewed, do not publish production privacy guarantees.</p>
      </div>
    </MarketingPage>
  );
}
