import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    // Prefer a fresh server so mock billing memory matches the seeded DB.
    reuseExistingServer: false,
    cwd: "../..",
    timeout: 120000,
    env: {
      ...process.env,
      // Align APP_URL with Playwright baseURL so absolute redirects keep the session cookie.
      APP_URL: process.env.APP_URL || "http://127.0.0.1:3000",
      ESIM_APP_URL: process.env.ESIM_APP_URL || "http://127.0.0.1:3000",
      PRODUCT_HOST_VPN: process.env.PRODUCT_HOST_VPN || "vpn.localhost,127.0.0.1,localhost",
      PRODUCT_HOST_ESIM: process.env.PRODUCT_HOST_ESIM || "sim.localhost,sim.example.com",
      // e2e sets x-forwarded-host because *.localhost often has no DNS in CI.
      TRUST_FORWARDED_HOST: process.env.TRUST_FORWARDED_HOST || "true",
      ESIM_PROVIDER: process.env.ESIM_PROVIDER || "mock",
      VPN_PROVIDER: process.env.VPN_PROVIDER || "mock",
      BILLING_PROVIDER: process.env.BILLING_PROVIDER || "mock",
    },
  },
});
