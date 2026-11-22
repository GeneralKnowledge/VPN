import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { tripConnectivity, type TripConnectivity } from "@/lib/trip-connectivity";
import { formatTripDates } from "@/lib/trip-dates";
import { appUrl, getDb } from "@/lib/providers";
import { listTrips } from "@/lib/trips";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { DeleteTripButton } from "./delete-trip-button";

export const metadata = { title: "My trips", robots: { index: false } };

export default async function TripsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const trips = await listTrips(getDb(), user.id);
  const esimBase = appUrl("esim");
  const connectivity = await Promise.all(trips.map((trip) => tripConnectivity(trip, esimBase)));

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">My trips</h1>
          <p className="mt-2 text-muted">Saved here and in the Northstar app when you sign in with the same account.</p>
        </div>
        <LogoutButton />
      </div>

      {trips.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-surface p-6">
          <p>No trips yet.</p>
          <p className="mt-2 text-sm text-muted">
            Open a{" "}
            <Link href="/destinations">
              <span className="text-sea underline">destination</span>
            </Link>{" "}
            and save it as a trip.
          </p>
        </div>
      ) : (
        <ul className="mt-10 space-y-4" aria-label="Saved trips">
          {trips.map((trip, i) => (
            <li key={trip.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl">
                    <Link href={`/destinations/${trip.destination.slug}`}>{trip.destination.name}</Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">{formatTripDates(trip.startDate, trip.endDate)}</p>
                </div>
                <DeleteTripButton id={trip.id} name={trip.destination.name} />
              </div>
              {trip.notes ? <p className="mt-3 whitespace-pre-wrap text-sm">{trip.notes}</p> : null}
              <StayConnected name={trip.destination.name} connectivity={connectivity[i]!} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Phase 3: the eSIM plan we'd suggest for this trip. Buying happens on the eSIM site's own checkout. */
function StayConnected({ name, connectivity }: { name: string; connectivity: TripConnectivity }) {
  const plan = connectivity.suggested;
  return (
    <div className="mt-4 rounded-lg bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Stay connected</h3>
        <Badge tone="sea">Our product</Badge>
      </div>
      {plan ? (
        <p className="mt-2 text-sm">
          <span className="font-medium">{plan.name}</span>
          <span className="text-muted">
            {" "}
            · {plan.dataVolume}
            {plan.validity ? ` · ${plan.validity}` : ""} · {formatMoney(plan.price, plan.currency)}
          </span>
        </p>
      ) : null}
      <p className="mt-1 text-sm text-muted">{connectivity.note}</p>
      {connectivity.available && (plan || connectivity.others.length > 0) ? (
        <p className="mt-2 text-sm">
          <a href={connectivity.plansUrl}>
            <span className="font-medium text-sea underline">
              {plan ? "Buy it on Northstar SIM" : `See ${name} plans on Northstar SIM`}
            </span>
          </a>
        </p>
      ) : null}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Setting up an eSIM</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {connectivity.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
