import { z } from "zod";

/** Central brand — change here to rebrand globally. */
export const brand = {
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
} as const;

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

export const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default(brand.name),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: z.string().url().optional(),
  VPN_PROVIDER: z.enum(["mock", "vpnresellers"]).default("mock"),
  VPNRESELLERS_API_URL: z.string().url().default("https://api.vpnresellers.com/v4_1"),
  VPNRESELLERS_API_TOKEN: z.string().optional().default(""),
  VPNRESELLERS_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  VPNRESELLERS_PROJECT_ID: z.coerce.number().int().positive().optional(),
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
