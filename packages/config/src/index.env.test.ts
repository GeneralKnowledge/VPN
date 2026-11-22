import { describe, expect, it } from "vitest";
import { parseEnv, productionEnvProblems } from "./index";

const base = {
  DATABASE_URL: "file:./x.db",
  AUTH_SECRET: "a-very-long-random-secret-value-1234567890",
  APP_URL: "https://vpn.example.com",
  APP_ENV: "production",
  BILLING_PROVIDER: "stripe",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_SECRET_KEY: "sk_test_x",
  CRYPTO_BILLING_PROVIDER: "crypto",
};

describe("production env", () => {
  it("treats NODE_ENV=production without APP_ENV as production", () => {
    const env = parseEnv({ ...base, APP_ENV: undefined, NODE_ENV: "production" });
    expect(env.APP_ENV).toBe("production");
  });

  it("keeps an explicit APP_ENV", () => {
    const env = parseEnv({ ...base, APP_ENV: "development", NODE_ENV: "production" });
    expect(env.APP_ENV).toBe("development");
  });

  it("requires a Stripe secret key and refuses ResellPortal test mode in production", () => {
    const problems = productionEnvProblems(
      parseEnv({
        ...base,
        STRIPE_SECRET_KEY: "",
        ESIM_PROVIDER: "resellportal",
        RESELLPORTAL_API_KEY: "k",
        RESELLPORTAL_API_SECRET: "s",
        RESELLPORTAL_TEST_MODE: "true",
      }),
    ).join("\n");
    expect(problems).toMatch(/STRIPE_SECRET_KEY/);
    expect(problems).toMatch(/RESELLPORTAL_TEST_MODE/);
  });

  it("requires a USD rate for live eSIM pricing and treats an empty value as unset", () => {
    const live = { ...base, ESIM_PROVIDER: "resellportal", RESELLPORTAL_API_KEY: "k", RESELLPORTAL_API_SECRET: "s" };
    expect(productionEnvProblems(parseEnv({ ...live, ESIM_USD_TO_GBP: "" })).join("\n")).toMatch(/ESIM_USD_TO_GBP/);
    const env = parseEnv({ ...live, ESIM_USD_TO_GBP: "0.8" });
    expect(env.ESIM_USD_TO_GBP).toBe(0.8);
    expect(env.ESIM_MARKUP).toBe(1.4);
    expect(productionEnvProblems(env).join("\n")).not.toMatch(/ESIM_USD_TO_GBP/);
  });

  it("checks the card-statement suffixes", () => {
    expect(parseEnv(base).STRIPE_STATEMENT_SUFFIX_ESIM).toBe("ESIM");
    const problems = productionEnvProblems(parseEnv({ ...base, STRIPE_STATEMENT_SUFFIX_ESIM: "<bad>" })).join("\n");
    expect(problems).toMatch(/STRIPE_STATEMENT_SUFFIX_ESIM/);
  });

  it("keeps live Stripe payments off unless explicitly allowed", () => {
    expect(parseEnv(base).STRIPE_ALLOW_LIVE_PAYMENTS).toBe(false);
    expect(parseEnv({ ...base, STRIPE_ALLOW_LIVE_PAYMENTS: "true" }).STRIPE_ALLOW_LIVE_PAYMENTS).toBe(true);
  });

  it("accepts a sound production config", () => {
    expect(productionEnvProblems(parseEnv(base))).toEqual([]);
  });

  it("rejects mock billing, localhost URLs and dev secrets", () => {
    const problems = productionEnvProblems(
      parseEnv({
        ...base,
        BILLING_PROVIDER: "mock",
        APP_URL: "http://localhost:3000",
        AUTH_SECRET: "dev-only-change-me-in-production-use-openssl-rand",
      }),
    );
    expect(problems.join("\n")).toMatch(/AUTH_SECRET/);
    expect(problems.join("\n")).toMatch(/APP_URL/);
    expect(problems.join("\n")).toMatch(/mock/);
  });

  it("allows mock billing only with the explicit override", () => {
    const env = parseEnv({ ...base, BILLING_PROVIDER: "mock", ALLOW_MOCK_BILLING_IN_PRODUCTION: "true" });
    expect(productionEnvProblems(env)).toEqual([]);
  });

  it("rejects mock crypto billing, which would grant prepaid plans for free", () => {
    const problems = productionEnvProblems(parseEnv({ ...base, CRYPTO_BILLING_PROVIDER: "mock" }));
    expect(problems.join("\n")).toMatch(/CRYPTO_BILLING_PROVIDER=mock/);
  });

  it("defaults crypto billing to mock, so an unset value is refused too", () => {
    const problems = productionEnvProblems(parseEnv({ ...base, CRYPTO_BILLING_PROVIDER: undefined }));
    expect(problems.join("\n")).toMatch(/CRYPTO_BILLING_PROVIDER=mock/);
  });

  it("allows mock crypto billing with the explicit mock-billing override", () => {
    const env = parseEnv({ ...base, CRYPTO_BILLING_PROVIDER: "mock", ALLOW_MOCK_BILLING_IN_PRODUCTION: "true" });
    expect(productionEnvProblems(env)).toEqual([]);
  });

  it("refuses mock billing together with a live eSIM provider, even with the override", () => {
    const problems = productionEnvProblems(
      parseEnv({
        ...base,
        BILLING_PROVIDER: "mock",
        ALLOW_MOCK_BILLING_IN_PRODUCTION: "true",
        ESIM_PROVIDER: "resellportal",
        RESELLPORTAL_API_KEY: "k",
        RESELLPORTAL_API_SECRET: "s",
      }),
    );
    expect(problems.join("\n")).toMatch(/ESIM_PROVIDER/);
  });

  it("does not police non-production environments", () => {
    const env = parseEnv({ ...base, APP_ENV: "development", BILLING_PROVIDER: "mock", APP_URL: "http://localhost:3000" });
    expect(productionEnvProblems(env)).toEqual([]);
  });
});

describe("blank values", () => {
  it("treats KEY= copied from .env.example as unset", () => {
    const env = parseEnv({
      ...base,
      APP_ENV: "development",
      VPNRESELLERS_PROJECT_ID: "",
      SUPPORT_INBOX_EMAIL: "",
      ESIM_APP_URL: "",
      TRAVEL_APP_URL: " ",
      AUTH_URL: "",
      ESIM_USD_TO_GBP: "",
    });
    expect(env.VPNRESELLERS_PROJECT_ID).toBeUndefined();
    expect(env.SUPPORT_INBOX_EMAIL).toBeUndefined();
    expect(env.ESIM_APP_URL).toBeUndefined();
    expect(env.TRAVEL_APP_URL).toBeUndefined();
    expect(env.AUTH_URL).toBeUndefined();
    expect(env.ESIM_USD_TO_GBP).toBeUndefined();
  });

  it("reads the travel partners, and keeps the test partner out of production", () => {
    expect(parseEnv({ ...base, APP_ENV: "development" }).TRAVEL_PARTNERS).toEqual(["mock"]);
    expect(parseEnv({ ...base, TRAVEL_PARTNERS: " Mock , other" }).TRAVEL_PARTNERS).toEqual(["mock", "other"]);
    expect(parseEnv({ ...base, TRAVEL_PARTNERS: "none" }).TRAVEL_PARTNERS).toEqual([]);
    expect(parseEnv({ ...base, TRAVEL_PARTNERS: "" }).TRAVEL_PARTNERS).toEqual([]);
    expect(parseEnv(base).TRAVEL_PARTNERS).toEqual([]);
    expect(productionEnvProblems(parseEnv({ ...base, TRAVEL_PARTNERS: "mock" })).join("\n")).toMatch(/TRAVEL_PARTNERS/);
    expect(productionEnvProblems(parseEnv({ ...base, TRAVEL_PARTNERS: "none" })).join("\n")).not.toMatch(/TRAVEL_PARTNERS/);
    expect(
      productionEnvProblems(parseEnv({ ...base, TRAVEL_PARTNERS: "mock", ALLOW_MOCK_BILLING_IN_PRODUCTION: "true" })).join("\n"),
    ).not.toMatch(/TRAVEL_PARTNERS/);
  });

  it("still rejects a value that is set but wrong", () => {
    expect(() => parseEnv({ ...base, APP_ENV: "development", SUPPORT_INBOX_EMAIL: "not-an-email" })).toThrow();
  });

  it("parses the whole .env.example", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const raw: Record<string, string> = {};
    for (const line of readFileSync(resolve(__dirname, "../../../.env.example"), "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] !== undefined) raw[m[1]] = m[2] ?? "";
    }
    expect(() => parseEnv(raw)).not.toThrow();
  });
});
