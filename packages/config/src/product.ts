export const products = ["vpn", "esim"] as const;
export type Product = (typeof products)[number];

export const PRODUCT_HEADER = "x-northstar-product";

export type BrandConfig = {
  name: string;
  shortName: string;
  legalName: string;
  tagline: string;
  supportEmail: string;
  domain: string;
  referralPrefix: string;
  colors: {
    ink: string;
    mist: string;
    sea: string;
    seaDark: string;
    accent: string;
    accentSoft: string;
    danger: string;
    success: string;
    muted: string;
  };
  fonts: {
    display: string;
    body: string;
    mono: string;
  };
};

/** VPN brand (primary / default). */
export const vpnBrand = {
  name: "Northstar VPN",
  shortName: "Northstar",
  legalName: "Northstar VPN Ltd",
  tagline: "Private internet access, simply.",
  supportEmail: "support@northstar.local",
  domain: "northstar.local",
  referralPrefix: "NORTH",
  colors: {
    ink: "#0B1F2A",
    mist: "#E8F1F4",
    sea: "#1A6B7A",
    seaDark: "#0F4A56",
    accent: "#C4A35A",
    accentSoft: "#E8D9A8",
    danger: "#B33A3A",
    success: "#2F7D4A",
    muted: "#5A7180",
  },
  fonts: {
    display: "Fraunces",
    body: "Source Sans 3",
    mono: "IBM Plex Mono",
  },
} as const satisfies BrandConfig;

/** eSIM brand — separate marketing voice; same ops company for now. */
export const esimBrand = {
  name: "Northstar SIM",
  shortName: "Northstar SIM",
  legalName: "Northstar VPN Ltd",
  tagline: "Travel data that installs in a minute.",
  supportEmail: "sim@northstar.local",
  domain: "sim.northstar.local",
  referralPrefix: "SIM",
  colors: {
    ink: "#1A2332",
    mist: "#EEF3F7",
    sea: "#2A6F8F",
    seaDark: "#1A4A62",
    accent: "#D4A017",
    accentSoft: "#F0E0A0",
    danger: "#B33A3A",
    success: "#2F7D4A",
    muted: "#5A7180",
  },
  fonts: {
    display: "Fraunces",
    body: "Source Sans 3",
    mono: "IBM Plex Mono",
  },
} as const satisfies BrandConfig;

export const brands = {
  vpn: vpnBrand,
  esim: esimBrand,
} as const;

export function getBrand(product: Product = "vpn"): BrandConfig {
  return brands[product];
}

export function isProduct(value: string | null | undefined): value is Product {
  return value === "vpn" || value === "esim";
}

/** Normalise a Host header to hostname without port. */
export function hostWithoutPort(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  }
  return trimmed.split(":")[0] ?? trimmed;
}

export type ProductHostConfig = {
  vpnHosts: string[];
  esimHosts: string[];
  defaultProduct: Product;
};

/**
 * Resolve which product a request belongs to from the Host header.
 * Unmatched hosts fall back to `defaultProduct` (vpn) so localhost keeps working.
 */
export function resolveProductFromHost(
  hostHeader: string | null | undefined,
  config: ProductHostConfig,
): Product {
  if (!hostHeader) return config.defaultProduct;
  const host = hostWithoutPort(hostHeader);
  if (config.esimHosts.some((h) => hostWithoutPort(h) === host)) return "esim";
  if (config.vpnHosts.some((h) => hostWithoutPort(h) === host)) return "vpn";
  return config.defaultProduct;
}

/**
 * Pick the hostname used for product routing.
 * Client-supplied `x-forwarded-host` is ignored unless `trustForwardedHost` is true
 * (set TRUST_FORWARDED_HOST=true only behind a proxy that overwrites that header).
 */
export function resolveRequestHost(
  headers: { get(name: string): string | null },
  options?: { trustForwardedHost?: boolean },
): string | null {
  if (options?.trustForwardedHost) {
    const forwarded = headers.get("x-forwarded-host");
    if (forwarded?.trim()) return forwarded;
  }
  return headers.get("host");
}

/** Paths that only make sense on the VPN product host. */
export const VPN_ONLY_PREFIXES = [
  "/dashboard/vpn",
  "/dashboard/locations",
  "/dashboard/setup",
  "/dashboard/devices",
  "/download",
  "/locations",
  "/features",
] as const;

/** Paths that only make sense on the eSIM product host (after rewrite, under /sim). */
export const ESIM_ONLY_PREFIXES = ["/dashboard/esim", "/sim"] as const;
