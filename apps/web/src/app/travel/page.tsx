import Link from "next/link";
import { travelBrand } from "@northstar/config";
import { listDestinations } from "@northstar/destinations";
import { Button } from "@/components/ui";
import { DestinationCard } from "./destination-card";

export const metadata = {
  title: { absolute: travelBrand.name },
  alternates: { canonical: "/" },
};

export default function TravelHomePage() {
  const destinations = listDestinations();
  return (
    <>
      <section className="hero-mesh relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="animate-rise max-w-2xl">
            <p className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              {travelBrand.name}
            </p>
            <h1 className="mt-4 text-2xl font-medium text-ink/90 sm:text-3xl">
              Plan the trip, then get connected.
            </h1>
            <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
              Pick a destination for the essentials before you go, a travel eSIM that works there, and a
              rough budget of your own.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/destinations">
                <Button size="lg">Browse destinations</Button>
              </Link>
              <Link href="/search">
                <Button size="lg" variant="ghost">
                  Search with estimates
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="popular">
        <h2 id="popular" className="font-display text-3xl">
          Where to?
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <DestinationCard key={d.slug} destination={d} />
          ))}
        </ul>
      </section>
    </>
  );
}
