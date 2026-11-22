import type { Metadata } from "next";
import Link from "next/link";
import { getDestination } from "@northstar/destinations";
import { categoryLabel, isPartnerCategory } from "@northstar/travel-partners";

export const metadata: Metadata = {
  title: "Test partner",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Where the test partner's links land. It stands in for a real partner's site so the referral
 * flow can be tried end to end; nothing here is a real company or a real search.
 */
export default async function PartnerPreviewPage({ searchParams }: Props) {
  const query = await searchParams;
  const category = one(query.category);
  const destination = getDestination(one(query.destination) ?? "");
  const what = category && isPartnerCategory(category) ? categoryLabel(category).toLowerCase() : "a search";
  const clickId = one(query.subid);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-wide text-muted">Test partner</p>
      <h1 className="mt-2 font-display text-4xl">This is where a partner&apos;s site would open</h1>
      <p className="mt-4 text-muted">
        You followed a link from the test partner, which isn&apos;t a real company. With a real travel
        partner, you&apos;d now be on their site looking at {what}
        {destination ? ` for ${destination.name}` : ""}, and you&apos;d book with them, not with us.
      </p>
      {clickId && /^clk_[0-9a-f]{16}$/.test(clickId) ? (
        <p className="mt-4 text-sm text-muted">
          Click reference passed to the partner: <code>{clickId}</code>. It&apos;s random and says nothing about you.
        </p>
      ) : null}
      <p className="mt-8">
        <Link href={destination ? `/destinations/${destination.slug}` : "/destinations"}>
          <span className="font-medium text-sea underline">
            Back to {destination ? destination.name : "destinations"}
          </span>
        </Link>
      </p>
    </div>
  );
}
