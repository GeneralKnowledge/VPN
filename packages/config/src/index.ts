import { z } from "zod";

export {
  normaliseCityKey,
  projectEquirectangular,
  resolveLocationCoords,
  type Coords,
} from "./geo";

export {
  PRODUCT_HEADER,
  VPN_ONLY_PREFIXES,
  ESIM_ONLY_PREFIXES,
  brands,
  esimBrand,
  getBrand,
  hostWithoutPort,
  isProduct,
  products,
  resolveProductFromHost,
  vpnBrand,
  type BrandConfig,
  type Product,
  type ProductHostConfig,
} from "./product";

import { vpnBrand } from "./product";

/** @deprecated Prefer getBrand(product). Kept as the VPN brand for existing imports. */
export const brand = vpnBrand;

export type Brand = typeof brand;

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().int().nonnegative(),
  currency: z.literal("GBP"),
  billingInterval: z.enum(["month", "year"]),
  features: z.array(z.string()),
  maxDevices: z.number().int().positive(),
  active: z.boolean(),
  stripePriceEnvKey: z.string().optional(),
});

export type Plan = z.infer<typeof planSchema>;

/** Prices in minor units (pence). Easy to change. */
export const plans: Plan[] = [
  {
    id: "premium-monthly",
    name: "Northstar Premium",
    description: "Full access billed monthly. Cancel anytime.",
    price: 499,
    currency: "GBP",
    billingInterval: "month",
    maxDevices: 5,
    active: true,
    stripePriceEnvKey: "STRIPE_PRICE_MONTHLY",
    features: [
      "Up to 5 devices",
      "All available locations",
      "WireGuard & OpenVPN configs",
      "Email support",
    ],
  },
  {
    id: "premium-annual",
    name: "Northstar Premium Annual",
    description: "Same Premium access with annual billing.",
    price: 3999,
    currency: "GBP",
    billingInterval: "year",
    maxDevices: 5,
    active: true,
    stripePriceEnvKey: "STRIPE_PRICE_ANNUAL",
    features: [
      "Up to 5 devices",
      "All available locations",
      "WireGuard & OpenVPN configs",
      "Email support",
      "Lower annual rate",
    ],
  },
];

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id && p.active);
}

export function formatPrice(plan: Plan): string {
  const major = (plan.price / 100).toFixed(2);
  const suffix = plan.billingInterval === "month" ? "/month" : "/year";
  return `£${major}${suffix}`;
}

const providerEnum = z.enum(["mock", "vpnresellers", "stripe", "smtp", "posthog", "console", "sentry"]);

/** Comma-separated hostnames (no scheme); ports are ignored at match time. */
function hostList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim()) return fallback;
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Public URL for the eSIM host (emails / checkout returns). Defaults to APP_URL. */
  ESIM_APP_URL: z.string().url().optional(),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default(brand.name),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: z.string().url().optional(),
  /** Comma-separated hosts that serve the VPN product. Empty → defaultProduct only. */
  PRODUCT_HOST_VPN: z.string().optional().default(""),
  /** Comma-separated hosts that serve the eSIM product (e.g. sim.localhost,sim.example.com). */
  PRODUCT_HOST_ESIM: z.string().optional().default("sim.localhost,sim.example.com"),
  VPN_PROVIDER: z.enum(["mock", "vpnresellers"]).default("mock"),
  VPNRESELLERS_API_URL: z.string().url().default("https://api.vpnresellers.com/v4_1"),
  VPNRESELLERS_API_TOKEN: z.string().optional().default(""),
  VPNRESELLERS_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  VPNRESELLERS_PROJECT_ID: z.coerce.number().int().positive().optional(),
  ESIM_PROVIDER: z.enum(["mock", "resellportal"]).default("mock"),
  RESELLPORTAL_API_URL: z
    .string()
    .url()
    .default("https://panel.resellportal.com/wp-json/resellportal/v1"),
  RESELLPORTAL_API_KEY: z.string().optional().default(""),
  RESELLPORTAL_API_SECRET: z.string().optional().default(""),
  RESELLPORTAL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  CRON_SECRET: z.string().optional().default(""),
  /** Where the public contact form delivers mail. Defaults to the brand support address. */
  SUPPORT_INBOX_EMAIL: z.string().email().optional(),
  /**
   * Mock billing activates subscriptions without taking payment. It is refused in production
   * unless this is explicitly set (private beta / manual billing only).
   */
  ALLOW_MOCK_BILLING_IN_PRODUCTION: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  BILLING_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  /** Shared secret for /api/webhooks/stripe (required for valid signatures, mock or stripe). */
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  /** Optional secret for /api/webhooks/vpnresellers; falls back to CRON_SECRET at the route. */
  VPNRESELLERS_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default(""),
  STRIPE_PRICE_MONTHLY: z.string().optional().default(""),
  STRIPE_PRICE_ANNUAL: z.string().optional().default(""),
  EMAIL_PROVIDER: z.enum(["mock", "smtp"]).default("mock"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Northstar VPN <noreply@localhost>"),
  ANALYTICS_PROVIDER: z.enum(["mock", "posthog"]).default("mock"),
  POSTHOG_API_KEY: z.string().optional().default(""),
  POSTHOG_HOST: z.string().optional().default(""),
  ERROR_REPORTER: z.enum(["console", "sentry"]).default("console"),
  SENTRY_DSN: z.string().optional().default(""),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@northstar.local"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("AdminDev123!"),
  SEED_CUSTOMER_EMAIL: z.string().email().default("customer@northstar.local"),
  SEED_CUSTOMER_PASSWORD: z.string().min(8).default("CustomerDev123!"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined> = process.env): AppEnv {
  // Fail closed: a production runtime (`next start`) with APP_ENV unset must not behave like
  // development (non-Secure cookies, reset links in API responses, auto-verified emails).
  const appEnv = raw.APP_ENV ?? (raw.NODE_ENV === "production" ? "production" : undefined);
  return envSchema.parse({ ...raw, APP_ENV: appEnv });
}

export function productHostConfig(env: Pick<AppEnv, "PRODUCT_HOST_VPN" | "PRODUCT_HOST_ESIM">) {
  return {
    vpnHosts: hostList(env.PRODUCT_HOST_VPN, []),
    esimHosts: hostList(env.PRODUCT_HOST_ESIM, ["sim.localhost", "sim.example.com"]),
    defaultProduct: "vpn" as const,
  };
}

export function appUrlForProduct(env: AppEnv, product: "vpn" | "esim"): string {
  if (product === "esim" && env.ESIM_APP_URL) {
    return env.ESIM_APP_URL.replace(/\/$/, "");
  }
  return env.APP_URL.replace(/\/$/, "");
}

export function isMockMode(env: Pick<AppEnv, "VPN_PROVIDER" | "BILLING_PROVIDER" | "EMAIL_PROVIDER">): boolean {
  return (
    env.VPN_PROVIDER === "mock" &&
    env.BILLING_PROVIDER === "mock" &&
    env.EMAIL_PROVIDER === "mock"
  );
}

// silence unused in package build
void providerEnum;

export function isProductionEnv(env: Pick<AppEnv, "APP_ENV">): boolean {
  return env.APP_ENV === "production";
}

/** Returns human-readable problems that must block a production boot. */
export function productionEnvProblems(env: AppEnv): string[] {
  if (env.APP_ENV !== "production") return [];
  const problems: string[] = [];
  if (env.AUTH_SECRET.includes("dev-only") || env.AUTH_SECRET.length < 32) {
    problems.push("AUTH_SECRET must be a strong secret (32+ chars, not the dev default)");
  }
  const appUrl = new URL(env.APP_URL);
  if (appUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0"].includes(appUrl.hostname)) {
    problems.push("APP_URL must be the public https URL (it is used in emailed links and checkout redirects)");
  }
  if (env.VPN_PROVIDER === "vpnresellers" && !env.VPNRESELLERS_API_TOKEN) {
    problems.push("VPN_PROVIDER=vpnresellers requires VPNRESELLERS_API_TOKEN");
  }
  if (env.ESIM_PROVIDER === "resellportal" && (!env.RESELLPORTAL_API_KEY || !env.RESELLPORTAL_API_SECRET)) {
    problems.push("ESIM_PROVIDER=resellportal requires RESELLPORTAL_API_KEY and RESELLPORTAL_API_SECRET");
  }
  if (env.BILLING_PROVIDER === "mock" && !env.ALLOW_MOCK_BILLING_IN_PRODUCTION) {
    problems.push(
      "BILLING_PROVIDER=mock grants subscriptions without payment. Use a real provider, or set ALLOW_MOCK_BILLING_IN_PRODUCTION=true for a private beta",
    );
  }
  if (env.BILLING_PROVIDER === "stripe" && !env.STRIPE_WEBHOOK_SECRET) {
    problems.push("BILLING_PROVIDER=stripe requires STRIPE_WEBHOOK_SECRET");
  }
  return problems;
}
