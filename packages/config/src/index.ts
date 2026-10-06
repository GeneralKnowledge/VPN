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
  {
    id: "premium-referral",
    name: "Northstar Premium (Referral)",
    description: "Complimentary Premium earned via paying referrals. Not sold directly.",
    price: 0,
    currency: "GBP",
    billingInterval: "month",
    maxDevices: 5,
    active: true,
    features: [
      "Up to 5 devices",
      "All available locations",
      "WireGuard & OpenVPN configs",
      "Earned via referrals — not a paid checkout plan",
    ],
  },
];

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id && p.active);
}

export function formatPrice(plan: Plan): string {
  if (plan.price === 0) return "Free";
  const major = (plan.price / 100).toFixed(2);
  const suffix = plan.billingInterval === "month" ? "/month" : "/year";
  return `£${major}${suffix}`;
}

/** Paid plans shown on the marketing pricing page. */
export function purchasablePlans(): Plan[] {
  return plans.filter((p) => p.active && p.price > 0);
}

/**
 * Referral rewards — change here, not in UI copy scattered around the app.
 * Every `payingReferralsRequired` converted paying friends grants `rewardMonths`
 * of complimentary Premium (plan id `rewardPlanId`).
 */
export const referralProgram = {
  payingReferralsRequired: 3,
  rewardPlanId: "premium-referral",
  rewardMonths: 1,
  leaderboardSize: 10,
} as const;

export type ReferralProgram = typeof referralProgram;


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
  BILLING_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
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
  return envSchema.parse(raw);
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
