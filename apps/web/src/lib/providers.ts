import { createBillingProvider, type BillingProvider } from "@northstar/billing";
import { parseEnv, type AppEnv } from "@northstar/config";
import { createDb, type Db } from "@northstar/db";
import { createEmailProvider, type EmailProvider } from "@northstar/email";
import { createVPNProvider, type VPNProvider } from "@northstar/vpn-provider";
import path from "node:path";

const globalStore = globalThis as unknown as {
  northstarEnv?: AppEnv;
  northstarDb?: { db: Db; sqlite: { close: () => void } };
  northstarVpn?: VPNProvider;
  northstarBilling?: BillingProvider;
  northstarEmail?: EmailProvider;
};

export function getEnv(): AppEnv {
  if (!globalStore.northstarEnv) {
    process.env.NORTHSTAR_ROOT = process.env.NORTHSTAR_ROOT ?? path.resolve(process.cwd(), "../..");
    if (process.cwd().endsWith("apps/web")) {
      process.env.NORTHSTAR_ROOT = path.resolve(process.cwd(), "../..");
    } else {
      process.env.NORTHSTAR_ROOT = process.cwd();
    }
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./data/northstar.db";
    if (!process.env.AUTH_SECRET) {
      process.env.AUTH_SECRET = "dev-only-change-me-in-production-use-openssl-rand";
    }
    globalStore.northstarEnv = parseEnv(process.env);
  }
  return globalStore.northstarEnv;
}

export function getDb() {
  if (!globalStore.northstarDb) {
    getEnv();
    globalStore.northstarDb = createDb(process.env.DATABASE_URL);
  }
  return globalStore.northstarDb.db;
}

export function getVpnProvider() {
  if (!globalStore.northstarVpn) {
    const env = getEnv();
    globalStore.northstarVpn = createVPNProvider(env.VPN_PROVIDER, {
      apiUrl: env.VPNRESELLERS_API_URL,
      apiToken: env.VPNRESELLERS_API_TOKEN,
      timeoutMs: env.VPNRESELLERS_TIMEOUT_MS,
    });
  }
  return globalStore.northstarVpn;
}

export function getBillingProvider() {
  if (!globalStore.northstarBilling) {
    const env = getEnv();
    globalStore.northstarBilling = createBillingProvider(env.BILLING_PROVIDER, {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      priceMap: {
        "premium-monthly": env.STRIPE_PRICE_MONTHLY,
        "premium-annual": env.STRIPE_PRICE_ANNUAL,
      },
    });
  }
  return globalStore.northstarBilling;
}

export function getEmailProvider() {
  if (!globalStore.northstarEmail) {
    const env = getEnv();
    globalStore.northstarEmail = createEmailProvider(env.EMAIL_PROVIDER, {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.EMAIL_FROM,
    });
  }
  return globalStore.northstarEmail;
}

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  userId?: string;
}

export function track(event: AnalyticsEvent) {
  const env = getEnv();
  if (env.ANALYTICS_PROVIDER === "mock") {
    console.info("[analytics:mock]", event);
    return;
  }
  console.info("[analytics]", event.name);
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  const env = getEnv();
  const message = error instanceof Error ? error.message : String(error);
  const safe = { message, ...context };
  if (env.ERROR_REPORTER === "console") {
    console.error("[error]", safe);
    return;
  }
  console.error("[sentry:stub]", safe);
}

export function createLogger(correlationId: string) {
  return {
    info: (msg: string, meta?: Record<string, unknown>) =>
      console.info(JSON.stringify({ level: "info", msg, correlationId, ...meta })),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      console.warn(JSON.stringify({ level: "warn", msg, correlationId, ...meta })),
    error: (msg: string, meta?: Record<string, unknown>) =>
      console.error(JSON.stringify({ level: "error", msg, correlationId, ...meta })),
  };
}
