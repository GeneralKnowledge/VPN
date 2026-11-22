import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { entryRequirementsUrl, getDestination, isReviewed } from "@northstar/destinations";
import { Badge } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { partnerLinksFor } from "@/lib/partner-links";
import { appUrl, getDb, getTravelPartners } from "@/lib/providers";
import { esimPlansUrl, packagesForDestination } from "@/lib/travel";
import { BudgetEstimate } from "./budget-estimate";
import { PartnerLinks } from "./partner-links";
import { SaveTripForm } from "./save-trip-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const destination = getDestination((await params).slug);
  if (!destination) return {};
  return {
    title: destination.name,
    description: `Essentials, a travel eSIM and a rough budget for ${destination.name}.`,
    alternates: { canonical: `/destinations/${destination.slug}` },
  };
}

function Section({
  id,
  title,
  ours = false,
  children,
}: {
  id: string;
  title: string;
  ours?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={id} className="font-display text-2xl">
          {title}
        </h2>
        {ours ? <Badge tone="sea">Our product</Badge> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function DestinationPage({ params }: Props) {
  const destination = getDestination((await params).slug);
  if (!destination) notFound();

  const esim = await packagesForDestination(destination);
  const esimBase = appUrl("esim");
  const reviewed = isReviewed(destination);
  const user = await getSessionUser();
  const partners = await partnerLinksFor(
    getDb(),
    getTravelPartners(),
    destination,
    "destination-page",
    appUrl("travel"),
  );

  const facts: [string, string][] = [
    ["Currency", `${destination.currency.name} (${destination.currency.code})`],
    ["Language", destination.languages.join(", ")],
    ["Plugs", `Type ${destination.plugTypes.join(", ")} · ${destination.voltage} V`],
    ["Driving", `On the ${destination.drivesOn}`],
    ...destination.emergencyNumbers.map((e): [string, string] => [e.label, e.number]),
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="text-sm text-muted">
        <Link href="/destinations" className="hover:text-foreground">
          Destinations
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl">{destination.name}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{destination.summary}</p>

      <Section id="before-you-go" title="Before you go">
        {!reviewed ? (
          <p className="mb-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
            Draft: these facts haven&apos;t been checked against official sources yet.
          </p>
        ) : null}
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-border/60 pb-2">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm">
          Visas, passports and entry rules change. Check the UK government&apos;s{" "}
          <a href={entryRequirementsUrl(destination)} rel="noopener">
            <span className="text-sea underline">entry requirements for {destination.name}</span>
          </a>{" "}
          and its{" "}
          <a href={destination.travelAdviceUrl} rel="noopener">
            <span className="text-sea underline">travel advice</span>
          </a>{" "}
          before you go.
        </p>
      </Section>

      <Section id="stay-connected" title="Stay connected" ours>
        <p className="text-sm text-muted">
          A travel eSIM from Northstar SIM gives you data on arrival without a plastic SIM. You buy it on the
          Northstar SIM site.
        </p>
        {!esim.ok ? (
          <p className="mt-4 text-sm">We couldn&apos;t load eSIM plans just now. Try again in a minute.</p>
        ) : esim.packages.length === 0 ? (
          <p className="mt-4 text-sm">No eSIM plans for {destination.name} yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label={`eSIM plans for ${destination.name}`}>
            {esim.packages.map((pkg) => (
              <li key={pkg.code} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{pkg.countryName}</p>
                <p className="mt-1 font-medium">{pkg.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {pkg.dataVolume}
                  {pkg.validity ? ` · ${pkg.validity}` : ""}
                </p>
                <p className="mt-2 font-display text-xl">{formatMoney(pkg.price, pkg.currency)}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4">
          <a href={esimPlansUrl(esimBase, destination.countryCode)}>
            <span className="font-medium text-sea underline">See {destination.name} plans on Northstar SIM</span>
          </a>
        </p>
      </Section>

      <Section id="getting-there" title="Flights, stays and travel essentials">
        {partners.groups.length === 0 ? (
          <p className="text-sm text-muted">
            Searches with travel partners are coming. We&apos;ll only show a price when a partner gives us a
            live one, and we&apos;ll always say when we may earn a commission.
          </p>
        ) : (
          <PartnerLinks destinationName={destination.name} links={partners} />
        )}
      </Section>

      <Section id="stay-safe-online" title="Stay safe online" ours>
        <p className="text-sm text-muted">
          Hotel, airport and caf&eacute; Wi-Fi is shared with strangers. A VPN encrypts your connection on
          networks you don&apos;t control.
        </p>
        <p className="mt-3">
          <a href={appUrl("vpn")}>
            <span className="font-medium text-sea underline">About Northstar VPN</span>
          </a>
        </p>
      </Section>

      <Section id="budget" title="Rough budget">
        <BudgetEstimate
          destinationName={destination.name}
          packages={esim.packages.map((p) => ({ code: p.code, name: p.name, price: p.price }))}
        />
      </Section>

      <Section id="save-trip" title="Save as a trip">
        {user ? (
          <SaveTripForm slug={destination.slug} name={destination.name} />
        ) : (
          <p className="text-sm">
            <Link href="/login">
              <span className="font-medium text-sea underline">Log in</span>
            </Link>{" "}
            to save {destination.name} to your trips. They also show in the Northstar app.
          </p>
        )}
      </Section>
    </div>
  );
}
