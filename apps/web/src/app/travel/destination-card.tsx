import Link from "next/link";
import type { Destination } from "@northstar/destinations";

export function DestinationCard({ destination }: { destination: Destination }) {
  return (
    <li>
      <Link
        href={`/destinations/${destination.slug}`}
        className="block h-full rounded-xl border border-border bg-surface p-5 transition hover:border-sea focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
      >
        <h3 className="font-display text-xl">{destination.name}</h3>
        <p className="mt-2 text-sm text-muted">{destination.summary}</p>
      </Link>
    </li>
  );
}
