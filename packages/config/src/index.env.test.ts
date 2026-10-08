import { describe, expect, it } from "vitest";
import { parseEnv, productionEnvProblems } from "./index";

const base = {
  DATABASE_URL: "file:./x.db",
  AUTH_SECRET: "a-very-long-random-secret-value-1234567890",
  APP_URL: "https://vpn.example.com",
  APP_ENV: "production",
  BILLING_PROVIDER: "stripe",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
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

  it("does not police non-production environments", () => {
    const env = parseEnv({ ...base, APP_ENV: "development", BILLING_PROVIDER: "mock", APP_URL: "http://localhost:3000" });
    expect(productionEnvProblems(env)).toEqual([]);
  });
});
