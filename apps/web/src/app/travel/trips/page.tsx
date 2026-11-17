import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { formatTripDates } from "@/lib/trip-dates";
import { getDb } from "@/lib/providers";
import { listTrips } from "@/lib/trips";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { DeleteTripButton } from "./delete-trip-button";

export const metadata = { title: "My trips", robots: { index: false } };

export default async function TripsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const trips = await listTrips(getDb(), user.id);

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
          {trips.map((trip) => (
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
