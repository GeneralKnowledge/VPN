import { getEsimProvider } from "@/lib/providers";
import { formatMoney } from "@/lib/product";
import { EsimBuyButton } from "./buy-button";

export const metadata = {
  title: "Plans",
  description: "One-time eSIM data packages by destination.",
};

export default async function EsimPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const params = await searchParams;
  const country = params.country?.toUpperCase();
  const packages = await getEsimProvider().listPackages(country ? { country } : undefined);
  const countries = [...new Set(packages.map((p) => p.countryCode))].sort();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Plans</h1>
      <p className="mt-2 max-w-2xl text-muted">
        One-time data packages. Pay once, install via QR, use until the data or validity runs out.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <a
          href="/pricing"
          className={`rounded-md px-3 py-1.5 text-sm ${!country ? "bg-sea text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
        >
          All
        </a>
        {countries.map((code) => (
          <a
            key={code}
            href={`/pricing?country=${code}`}
            className={`rounded-md px-3 py-1.5 text-sm ${country === code ? "bg-sea text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
          >
            {code}
          </a>
        ))}
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <li key={pkg.code} className="border border-border bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{pkg.countryName}</p>
            <h2 className="mt-1 font-display text-xl">{pkg.name}</h2>
            <p className="mt-2 text-sm text-muted">
              {pkg.dataVolume}
              {pkg.validity ? ` · ${pkg.validity}` : ""}
            </p>
            <p className="mt-4 font-display text-2xl">{formatMoney(pkg.price, pkg.currency)}</p>
            <div className="mt-4">
              <EsimBuyButton packageCode={pkg.code} />
            </div>
          </li>
        ))}
      </ul>
      {packages.length === 0 ? (
        <p className="mt-10 text-muted">No packages for that filter right now.</p>
      ) : null}
    </div>
  );
}
