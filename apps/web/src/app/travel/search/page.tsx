import type { Metadata } from "next";
import Link from "next/link";
import { randomBytes } from "node:crypto";
import { getDestination } from "@northstar/destinations";
import { destinationAirports, ESTIMATE_NOTE, originAirports, regions, todayInUk, type FlightOption, type Leg } from "@northstar/travel-search";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import {
  defaultDates,
  duration,
  place,
  runWebSearch,
  SEARCH_TAB_LABELS,
  searchHref,
  searchType,
  searchTypes,
  type Params,
  type SearchType,
  type WebSearchResult,
} from "@/lib/web-search";

export const metadata: Metadata = {
  title: "Search",
  description: "Estimated flights, stays, car hire and whole trips, to plan before you book.",
  alternates: { canonical: "/search" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const est = (minor: number) => `${formatMoney(minor)} est.`;

const REGION_LABELS: Record<(typeof regions)[number], string> = {
  europe: "Europe",
  asia: "Asia",
  americas: "The Americas",
  "middle-east": "Middle East",
};

export default async function SearchPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params: Params = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 100) : undefined]),
  );
  const type = searchType(params.type);
  const result = runWebSearch(type, params);

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Search</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Our own estimates, to plan with before you book. They aren&apos;t live prices and nothing here can be
        booked yet.
      </p>

      <nav aria-label="Search type" className="mt-8 flex flex-wrap gap-2">
        {searchTypes.map((t) => (
          <Link
            key={t}
            href={`/search?type=${t}`}
            aria-current={t === type ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${t === type ? "bg-sea text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
          >
            {SEARCH_TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      <SearchForm type={type} params={params} />
      <Results type={type} params={params} result={result} />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function AirportSelect({ id, name, value, origin }: { id: string; name: string; value?: string; origin: boolean }) {
  const list = origin ? originAirports() : destinationAirports();
  return (
    <Select id={id} name={name} defaultValue={value ?? list[0]?.code} required>
      {list.map((a) => (
        <option key={a.code} value={a.code}>
          {a.city} ({a.code})
        </option>
      ))}
    </Select>
  );
}

function SearchForm({ type, params }: { type: SearchType; params: Params }) {
  const { start, end } = defaultDates();
  const min = todayInUk();
  const date = (id: string, name: string, label: string, fallback: string) => (
    <Field id={id} label={label}>
      <Input id={id} name={name} type="date" min={min} defaultValue={params[name] ?? fallback} required />
    </Field>
  );
  const count = (id: string, name: string, label: string, fallback: number) => (
    <Field id={id} label={label}>
      <Input id={id} name={name} type="number" min={1} max={9} defaultValue={params[name] ?? String(fallback)} />
    </Field>
  );

  return (
    <form method="get" action="/search" className="mt-6 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
      <input type="hidden" name="type" value={type} />
      {type === "flights" || type === "packages" ? (
        <>
          <Field id="from" label="From">
            <AirportSelect id="from" name="from" value={params.from} origin />
          </Field>
          <Field id="to" label="To">
            <AirportSelect id="to" name="to" value={params.to} origin={false} />
          </Field>
          {date("depart", "depart", "Depart", start)}
          {type === "packages" ? (
            date("return", "return", "Return", end)
          ) : (
            <Field id="return" label="Return (leave empty for one way)">
              <Input
                id="return"
                name="return"
                type="date"
                min={min}
                // A one-way search keeps its empty return; only a fresh form gets the default.
                defaultValue={params.depart ? (params.return ?? "") : end}
              />
            </Field>
          )}
          {count("adults", "adults", "Adults", type === "packages" ? 2 : 1)}
          {type === "flights" ? (
            <Field id="sort" label="Sort by">
              <Select id="sort" name="sort" defaultValue={params.sort ?? "best"}>
                <option value="best">Best</option>
                <option value="cheapest">Cheapest</option>
                <option value="fastest">Fastest</option>
              </Select>
            </Field>
          ) : null}
        </>
      ) : null}

      {type === "stays" ? (
        <>
          <Field id="city" label="Where">
            <AirportSelect id="city" name="city" value={params.city} origin={false} />
          </Field>
          {count("guests", "guests", "Guests", 2)}
          {date("checkIn", "checkIn", "Check in", start)}
          {date("checkOut", "checkOut", "Check out", end)}
          <Field id="sort" label="Sort by">
            <Select id="sort" name="sort" defaultValue={params.sort ?? "cheapest"}>
              <option value="cheapest">Cheapest</option>
              <option value="comfort">Most comfortable</option>
            </Select>
          </Field>
        </>
      ) : null}

      {type === "cars" ? (
        <>
          <Field id="city" label="Pick up at">
            <AirportSelect id="city" name="city" value={params.city} origin={false} />
          </Field>
          <div className="hidden sm:block" />
          {date("pickUp", "pickUp", "Pick up", start)}
          {date("dropOff", "dropOff", "Drop off", end)}
        </>
      ) : null}

      {type === "surprise" ? (
        <>
          <input type="hidden" name="seed" value={randomBytes(6).toString("hex")} />
          <Field id="from" label="From">
            <AirportSelect id="from" name="from" value={params.from} origin />
          </Field>
          <Field id="region" label="Where">
            <Select id="region" name="region" defaultValue={params.region ?? ""}>
              <option value="">Anywhere</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="month" label="Month (optional)">
            <Input id="month" name="month" type="month" min={min.slice(0, 7)} defaultValue={params.month ?? ""} />
          </Field>
          <Field id="budget" label="Budget per person, flights and stay (£, optional)">
            <Input id="budget" name="budget" type="number" min={1} max={100000} defaultValue={params.budget ?? ""} />
          </Field>
          <Field id="nights" label="Nights">
            <Input id="nights" name="nights" type="number" min={2} max={14} defaultValue={params.nights ?? "7"} />
          </Field>
          {count("adults", "adults", "Adults", 1)}
        </>
      ) : null}

      <div className="sm:col-span-2">
        <Button type="submit">{type === "surprise" ? "Surprise me" : "Search"}</Button>
      </div>
    </form>
  );
}

function Note() {
  return (
    <p className="rounded-md bg-surface-2 px-3 py-2 text-sm" role="note">
      {ESTIMATE_NOTE}
    </p>
  );
}

function legText(leg: Leg): string {
  const stops = leg.via.length === 0 ? "Nonstop" : `Via ${leg.via.join(", ")}`;
  const nextDay = leg.arrivesDayOffset > 0 ? ` (+${leg.arrivesDayOffset})` : leg.arrivesDayOffset < 0 ? " (-1)" : "";
  return `${leg.from} ${leg.departs} → ${leg.to} ${leg.arrives}${nextDay} · ${duration(leg.durationMinutes)} · ${stops}`;
}

function FlightRow({ flight, adults }: { flight: FlightOption; adults: number }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p>{legText(flight.outbound)}</p>
          {flight.inbound ? <p>{legText(flight.inbound)}</p> : null}
          {flight.tags.length > 0 ? (
            <p className="flex gap-2 pt-1">
              {flight.tags.map((t) => (
                <Badge key={t} tone="sea">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Badge>
              ))}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-display text-xl">{est(flight.pricePerPersonMinor)}</p>
          <p className="text-xs text-muted">per person{adults > 1 ? `, ${est(flight.totalMinor)} total` : ""}</p>
        </div>
      </div>
    </li>
  );
}

function Results({ type, params, result }: { type: SearchType; params: Params; result: WebSearchResult }) {
  if (result.kind === "empty") return null;
  if (result.kind === "error") {
    return (
      <p className="mt-8 rounded-md border border-border bg-surface p-4 text-sm" role="alert">
        {result.message}
      </p>
    );
  }
  // The same default the schemas use when Adults is left empty.
  const adults = Number(params.adults) || (type === "packages" ? 2 : 1);

  return (
    <section aria-label="Results" className="mt-8 space-y-4">
      <Note />
      {result.kind === "flights" ? (
        result.options.length === 0 ? (
          <p className="text-sm text-muted">No flights we can estimate for that search.</p>
        ) : (
          <ul className="space-y-3">
            {result.options.map((f) => (
              <FlightRow key={f.id} flight={f} adults={adults} />
            ))}
          </ul>
        )
      ) : null}

      {result.kind === "stays" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {result.options.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-muted">
                {s.area}, {s.city} · {s.nights} night{s.nights === 1 ? "" : "s"}
                {s.rooms > 1 ? ` · ${s.rooms} rooms` : ""}
              </p>
              <p className="mt-2 font-display text-xl">{est(s.totalMinor)}</p>
              <p className="text-xs text-muted">{est(s.nightlyMinor)} a night</p>
            </li>
          ))}
        </ul>
      ) : null}

      {result.kind === "cars" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {result.options.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
              <p className="font-medium">{c.label}</p>
              <p className="text-sm text-muted">
                {c.seats} seats · {c.bags} bags · {c.automatic ? "Automatic" : "Manual"} · from {place(c.pickUp)}
              </p>
              <p className="mt-2 font-display text-xl">{est(c.totalMinor)}</p>
              <p className="text-xs text-muted">
                {est(c.dailyMinor)} a day for {c.days} day{c.days === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {result.kind === "packages" ? (
        <>
          <ul>
            <FlightRow flight={result.flight} adults={adults} />
          </ul>
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.options.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-medium">
                  Flight + {p.stay.label.charAt(0).toLowerCase() + p.stay.label.slice(1)}
                </p>
                <p className="text-sm text-muted">
                  {p.stay.area}, {p.stay.city} · {p.stay.nights} nights
                </p>
                <p className="mt-2 font-display text-xl">{est(p.totalMinor)}</p>
                <p className="text-xs text-muted">total for {adults}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {result.kind === "surprise" ? <Surprise params={params} result={result} /> : null}
    </section>
  );
}

function Surprise({ params, result }: { params: Params; result: Extract<WebSearchResult, { kind: "surprise" }> }) {
  const { trip } = result;
  const bump = (key: string) => String((Number(params[key] ?? 0) || 0) + 1);
  const country = trip.destination.destinationSlug ? getDestination(trip.destination.destinationSlug) : null;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-display text-3xl">{place(trip.destination.code)}</h2>
      <p className="mt-1 text-sm text-muted">
        {trip.depart} to {trip.returnDate} · {trip.nights} nights · {trip.adults} adult{trip.adults === 1 ? "" : "s"}
      </p>
      {trip.warnings.map((w) => (
        <p key={w} className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm" role="note">
          ⚠ {w}
        </p>
      ))}
      <ul className="mt-4 space-y-3">
        <FlightRow flight={trip.flight} adults={trip.adults} />
        <li className="rounded-xl border border-border p-4">
          <p className="font-medium">{trip.stay.label}</p>
          <p className="text-sm text-muted">
            {trip.stay.area}, {trip.stay.city} · {est(trip.stay.totalMinor)} for the stay
          </p>
        </li>
      </ul>
      <p className="mt-4 font-display text-2xl">{est(trip.perPersonMinor)} per person</p>
      <p className="text-sm text-muted">Flight and stay together; {est(trip.totalMinor)} in all.</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href={searchHref(params, { rollWhere: bump("rollWhere") })}>
          <span className="text-sea underline">Somewhere else</span>
        </Link>
        <Link href={searchHref(params, { rollWhen: bump("rollWhen") })}>
          <span className="text-sea underline">Other dates</span>
        </Link>
        <Link href={searchHref(params, { rollStay: bump("rollStay") })}>
          <span className="text-sea underline">Another stay</span>
        </Link>
        {country ? (
          <Link href={`/destinations/${country.slug}`}>
            <span className="font-medium text-sea underline">Before you go to {country.name}</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
