import { expect, test, type Page } from "@playwright/test";

/**
 * Product host is selected from Host (default). Playwright enables
 * TRUST_FORWARDED_HOST for this suite so we can set x-forwarded-host without
 * needing *.localhost DNS in CI.
 */
const ORIGIN = "http://127.0.0.1:3000";

async function asEsim(page: Page) {
  await page.setExtraHTTPHeaders({ "x-forwarded-host": "sim.localhost" });
}

async function asVpn(page: Page) {
  await page.setExtraHTTPHeaders({});
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${ORIGIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
}

async function mockBuyFirstPackage(page: Page) {
  await page.goto(`${ORIGIN}/pricing`);
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Buy$/ }).first().click();
  await page.waitForURL(/billing\/mock-esim-checkout/, { waitUntil: "commit", timeout: 20_000 });
  await page.getByRole("button", { name: /Pay with mock card/i }).click();
  await page.waitForURL(/dashboard\/esim/, { waitUntil: "commit", timeout: 20_000 });
}

test("esim host shows SIM brand and VPN host stays VPN", async ({ page }) => {
  await asEsim(page);
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByRole("link", { name: /Northstar SIM/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Travel data for your phone/i })).toBeVisible();

  await asVpn(page);
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByRole("link", { name: /Northstar VPN/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Private internet access/i })).toBeVisible();
});

test("esim mock purchase issues a QR on the dashboard", async ({ page }) => {
  await asEsim(page);
  await loginAs(page, "customer@northstar.local", "CustomerDev123!");
  await expect(page).toHaveURL(/dashboard\/esim/);
  await expect(page.getByRole("heading", { name: /Your eSIMs/i })).toBeVisible();

  await mockBuyFirstPackage(page);

  await expect(page.getByRole("heading", { name: /Your eSIMs/i })).toBeVisible();
  await expect(page.getByText("issued").first()).toBeVisible({ timeout: 15_000 });
  // Prior runs may leave multiple issued orders in the shared e2e DB.
  await expect(page.getByRole("img", { name: /eSIM QR code/i }).first()).toBeVisible();
  await expect(page.getByText(/ICCID/i).first()).toBeVisible();
});

test("admin esim orders lists purchases from the VPN host", async ({ page }) => {
  await asEsim(page);
  await loginAs(page, "customer@northstar.local", "CustomerDev123!");
  await mockBuyFirstPackage(page);

  // Fresh session on VPN host for admin (host-scoped product + cookies).
  await page.context().clearCookies();
  await asVpn(page);
  await page.goto(`${ORIGIN}/login`);
  await page.getByLabel("Email").fill("admin@northstar.local");
  await page.getByLabel("Password").fill("AdminDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/admin/);

  await page.goto(`${ORIGIN}/admin/esim`);
  await expect(page.getByRole("heading", { name: /eSIM orders/i })).toBeVisible();
  await expect(page.getByRole("table", { name: /eSIM orders/i })).toBeVisible();
  await expect(page.getByText("customer@northstar.local").first()).toBeVisible();
  await expect(page.getByText("issued").first()).toBeVisible();
});
