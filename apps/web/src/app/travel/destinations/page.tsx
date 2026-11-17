import { listDestinations } from "@northstar/destinations";
import { DestinationCard } from "../destination-card";

export const metadata = {
  title: "Destinations",
  description: "Essentials, connectivity and a rough budget for each destination.",
  alternates: { canonical: "/destinations" },
};

export default function DestinationsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Destinations</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Essentials before you go and a travel eSIM that works there. More destinations are on the way.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listDestinations().map((d) => (
          <DestinationCard key={d.slug} destination={d} />
        ))}
      </ul>
    </div>
  );
}
