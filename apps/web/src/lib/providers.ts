import { createBillingProvider, type BillingProvider } from "@northstar/billing";
import {
  appUrlForProduct,
  isProductionEnv,
  parseEnv,
  productionEnvProblems,
  type AppEnv,
  type Product,
} from "@northstar/config";
import { createDb, type Db } from "@northstar/db";
import { createPostgresDb } from "@northstar/db/postgres";
import { createEmailProvider, type EmailProvider } from "@northstar/email";
import { createEsimProvider, type EsimProvider } from "@northstar/esim-provider";
import { createVPNProvider, type VPNProvider } from "@northstar/vpn-provider";
import path from "node:path";

const globalStore = globalThis as unknown as {
  northstarEnv?: AppEnv;
  northstarDb?: { db: Db; close?: () => void };
  northstarVpn?: VPNProvider;
  northstarEsim?: EsimProvider;
  northstarBilling?: BillingProvider;
  northstarEmail?: EmailProvider;
};

function assertProductionEnv(env: AppEnv) {
  const problems = productionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${problems.join("\n- ")}`);
  }
}

export function getEnv(): AppEnv {
  if (!globalStore.northstarEnv) {
    process.env.NORTHSTAR_ROOT = process.cwd().endsWith("apps/web")
      ? path.resolve(process.cwd(), "../..")
      : (process.env.NORTHSTAR_ROOT ?? process.cwd());
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./data/northstar.db";
    const env = parseEnv(
      process.env.AUTH_SECRET
        ? process.env
        : { ...process.env, AUTH_SECRET: "dev-only-change-me-in-production-use-openssl-rand" },
    );
    assertProductionEnv(env);
    globalStore.northstarEnv = env;
  }
  return globalStore.northstarEnv;
}

export function isProduction(): boolean {
  return isProductionEnv(getEnv());
}

/**
 * Email verification is only enforced when mail can actually be delivered. With the mock email
 * provider nobody could ever click a link, so accounts are treated as verified.
 */
export function emailVerificationRequired(): boolean {
  return getEnv().EMAIL_PROVIDER !== "mock";
}

/** Public base URL for links in emails and checkout redirects (VPN / default). */
export function appUrl(product: Product = "vpn"): string {
  return appUrlForProduct(getEnv(), product);
}

export function getDb() {
  if (!globalStore.northstarDb) {
    getEnv();
    const url = process.env.DATABASE_URL ?? "file:./data/northstar.db";
    if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
      const pg = createPostgresDb(url);
      globalStore.northstarDb = { db: pg.db as unknown as Db, close: pg.close };
    } else {
      globalStore.northstarDb = createDb(url);
    }
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
      projectId: env.VPNRESELLERS_PROJECT_ID,
    });
  }
  return globalStore.northstarVpn;
}

export function getEsimProvider() {
  if (!globalStore.northstarEsim) {
    const env = getEnv();
    globalStore.northstarEsim = createEsimProvider(env.ESIM_PROVIDER, {
      apiUrl: env.RESELLPORTAL_API_URL,
      apiKey: env.RESELLPORTAL_API_KEY,
      apiSecret: env.RESELLPORTAL_API_SECRET,
      timeoutMs: env.RESELLPORTAL_TIMEOUT_MS,
    });
  }
  return globalStore.northstarEsim;
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

const SENSITIVE_KEY = /password|secret|token|key|credential|private|authorization|api[_-]?key|session/i;

function redactProperties(
  properties?: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> | undefined {
  if (!properties) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (typeof v === "string" && (v.includes("BEGIN ") || v.includes("PrivateKey"))) continue;
    out[k] = v;
  }
  return out;
}

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  userId?: string;
}

export function track(event: AnalyticsEvent) {
  const env = getEnv();
  const safe = { ...event, properties: redactProperties(event.properties) };
  if (env.ANALYTICS_PROVIDER === "mock") {
    console.info("[analytics:mock]", safe);
    return;
  }
  console.info("[analytics]", safe.name);
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  const env = getEnv();
  const message = error instanceof Error ? error.message : String(error);
  const safeContext = context ? { ...context } : undefined;
  if (safeContext) {
    for (const key of Object.keys(safeContext)) {
      if (SENSITIVE_KEY.test(key)) delete safeContext[key];
    }
  }
  const safe = { message, ...safeContext };
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
