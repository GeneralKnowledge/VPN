import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard|admin/);
}

test("lead can subscribe via mock checkout to VPN-ready", async ({ page }) => {
  const email = `e2e-sub-${Date.now()}@northstar.local`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Subscriber");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("E2eSubscribe123!");
  await page.getByRole("button", { name: /Create account/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Billing" }).click();
  await expect(page).toHaveURL(/dashboard\/billing/);
  await page.getByRole("button", { name: "Subscribe" }).first().click();
  await expect(page).toHaveURL(/billing\/mock-checkout/);
  await page.getByRole("button", { name: /Pay with mock card/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Devices" }).click();
  await expect(page.getByText("Ready").first()).toBeVisible({ timeout: 15_000 });
});

test("customer can revoke a device connection", async ({ page }) => {
  await login(page, "customer@northstar.local", "CustomerDev123!");

  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Locations" }).click();
  await expect(page).toHaveURL(/dashboard\/locations/);

  // Select a non-London city when possible so we do not clash with the seed iPhone.
  const cityButton = page.getByRole("button", { pressed: false }).filter({ hasText: /Paris|New York|Frankfurt|Amsterdam|Tokyo/i }).first();
  if (await cityButton.count()) {
    await cityButton.click();
  }

  const deviceName = `E2E Revoke ${Date.now()}`;
  await page.getByLabel("Device name").fill(deviceName);
  await page.getByRole("button", { name: /^Connect$/ }).click();
  await expect(page).toHaveURL(/dashboard\/vpn/, { timeout: 20_000 });
  await expect(page.getByText(deviceName)).toBeVisible();

  const row = page.locator("li").filter({ hasText: deviceName });
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove device" }).click();
  await expect(page.getByText(deviceName)).toHaveCount(0, { timeout: 10_000 });
});

test("billing cancel and resume smoke", async ({ page }) => {
  await login(page, "customer@northstar.local", "CustomerDev123!");
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Billing" }).click();
  await expect(page).toHaveURL(/dashboard\/billing/);

  const cancelBtn = page.getByRole("button", { name: "Cancel subscription" });
  const resumeBtn = page.getByRole("button", { name: "Resume subscription" });

  if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
    await page.getByRole("button", { name: "Cancel subscription" }).last().click();
    await expect(page.getByRole("button", { name: "Resume subscription" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Resume subscription" }).click();
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toBeVisible({ timeout: 10_000 });
  } else if (await resumeBtn.isVisible()) {
    await resumeBtn.click();
    await expect(page.getByRole("button", { name: "Cancel subscription" })).toBeVisible({ timeout: 10_000 });
  } else {
    throw new Error("Expected cancel or resume controls on billing for seed customer");
  }
});

test("account sessions list and sign out other devices", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await login(pageA, "customer@northstar.local", "CustomerDev123!");
  await login(pageB, "customer@northstar.local", "CustomerDev123!");

  await pageA.goto("/dashboard/account");
  await expect(pageA.getByRole("heading", { name: "Active sessions" })).toBeVisible();
  await expect(pageA.getByText("This device")).toBeVisible();
  await expect(pageA.getByRole("button", { name: "Sign out other devices" })).toBeVisible();

  await pageA.getByRole("button", { name: "Sign out other devices" }).click();
  await pageA.getByRole("button", { name: "Sign out others" }).click();
  await expect(pageA.getByRole("button", { name: "Sign out other devices" })).toHaveCount(0, { timeout: 10_000 });

  await pageB.goto("/dashboard");
  await expect(pageB).toHaveURL(/login/, { timeout: 15_000 });

  await contextA.close();
  await contextB.close();
});

test("legal drafts are noindex and omitted from sitemap", async ({ request, page }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const body = await sitemap.text();
  expect(body).not.toContain("/privacy");
  expect(body).not.toContain("/terms");
  expect(body).not.toContain("/refund");

  await page.goto("/privacy");
  await expect(page.getByText(/Draft placeholder only/i)).toBeVisible();
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots ?? "").toMatch(/noindex/i);
});

test("preferred location surfaces as last used in Quick Connect", async ({ page }) => {
  await login(page, "customer@northstar.local", "CustomerDev123!");
  await expect(page.getByRole("heading", { name: "Quick Connect" })).toBeVisible();
  const locationSelect = page.getByLabel(/Location/i);
  await expect(locationSelect).toBeVisible();
  const options = await locationSelect.locator("option").allTextContents();
  expect(options.some((t) => /last used/i.test(t))).toBeTruthy();
});
