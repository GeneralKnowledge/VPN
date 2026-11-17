import type { Destination } from "@northstar/destinations";
import type { EsimPackage } from "@northstar/esim-provider";
import { getEsimProvider } from "./providers";

export type DestinationPackages =
  | { ok: true; packages: EsimPackage[] }
  | { ok: false; packages: [] };

/**
 * Our eSIM packages that work at a destination: the country's own first, then any region that
 * covers it. Reads the eSIM catalogue only; checkout stays on the eSIM site.
 */
export async function packagesForDestination(destination: Destination): Promise<DestinationPackages> {
  try {
    const provider = getEsimProvider();
    const lists = await Promise.all(
      destination.esimCodes.map((country) => provider.listPackages({ country })),
    );
    const seen = new Set<string>();
    const packages: EsimPackage[] = [];
    for (const pkg of lists.flat()) {
      if (seen.has(pkg.code)) continue;
      seen.add(pkg.code);
      packages.push(pkg);
    }
    return { ok: true, packages };
  } catch {
    return { ok: false, packages: [] };
  }
}

/** The eSIM site's plans page, filtered to a country code. */
export function esimPlansUrl(esimBase: string, countryCode: string): string {
  return `${esimBase}/pricing?country=${encodeURIComponent(countryCode)}`;
}
