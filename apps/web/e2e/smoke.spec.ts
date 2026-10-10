import { expect, test } from "@playwright/test";

test("marketing homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Northstar VPN/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Private internet access/i })).toBeVisible();
});

test("pricing page shows plans and savings", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Northstar Premium/i }).first()).toBeVisible();
  await expect(page.getByText(/Save about/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pricing questions" })).toBeVisible();
});

test("sitemap and robots are served", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const body = await sitemap.text();
  expect(body).toContain("/pricing");
  expect(body).toContain("/features");
});

test("theme toggle cycles appearance", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /theme/i }).first();
  await expect(toggle).toBeVisible();
  // Cycle system → light → dark so the dark class is applied regardless of OS preference.
  await toggle.click();
  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", /System theme/i);
});

test("customer can log in to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("customer@northstar.local");
  await page.getByLabel("Password").fill("CustomerDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome/i })).toBeVisible();
});

test("trust page and self-serve onboarding checklist", async ({ page }) => {
  await page.goto("/trust");
  await expect(page.getByRole("heading", { name: /Trust/i })).toBeVisible();
  await expect(page.getByText(/Self-serve by design/i)).toBeVisible();

  // Lead seed user has no plan yet — checklist should guide them to billing.
  await page.goto("/login");
  await page.getByLabel("Email").fill("lead@northstar.local");
  await page.getByLabel("Password").fill("LeadDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("heading", { name: "Get set up" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go to billing" }).first()).toBeVisible();
});

test("download guides include platform anchors", async ({ page }) => {
  await page.goto("/download");
  await expect(page.getByRole("heading", { name: /Download/i })).toBeVisible();
  await expect(page.locator("#ios")).toBeVisible();
  await expect(page.getByRole("heading", { name: "iOS" })).toBeVisible();
  await expect(page.getByText(/Show QR for WireGuard/i)).toBeVisible();
});

test("admin can open customers table", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@northstar.local");
  await page.getByLabel("Password").fill("AdminDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/admin/);
  await page.goto("/admin/customers");
  await expect(page.getByRole("table", { name: "Customers" })).toBeVisible();
  await expect(page.getByText("customer@northstar.local")).toBeVisible();
});

test("admin subscriptions table lists seed customer", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@northstar.local");
  await page.getByLabel("Password").fill("AdminDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/admin/);
  await page.goto("/admin/subscriptions");
  await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Subscriptions" })).toBeVisible();
  await expect(page.getByText("customer@northstar.local")).toBeVisible();
});

test("mobile nav opens on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pricing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
});

test("dashboard nav marks the current page and locations can be filtered", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("customer@northstar.local");
  await page.getByLabel("Password").fill("CustomerDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  const nav = page.getByRole("navigation", { name: "Dashboard" });
  await nav.getByRole("link", { name: "Locations" }).click();
  await expect(page).toHaveURL(/dashboard\/locations/);
  await expect(nav.getByRole("link", { name: "Locations" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /Dashboard|Home/i })).not.toHaveAttribute("aria-current", "page");

  const before = await page.getByRole("button", { pressed: false }).count();
  await page.getByLabel("Search locations").fill("zzzz-no-match");
  await expect(page.getByText("No locations match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { pressed: false }).first()).toBeVisible();
  expect(before).toBeGreaterThan(0);
});

test("mobile dashboard uses bottom tabs and web manifest is served", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const body = await manifest.json();
  expect(body.name).toMatch(/Northstar/i);
  expect(body.display).toBe("standalone");
  expect(body.start_url).toContain("dashboard");

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/login");
  await page.getByLabel("Email").fill("customer@northstar.local");
  await page.getByLabel("Password").fill("CustomerDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  const tabs = page.getByRole("navigation", { name: "Dashboard" });
  await expect(tabs.getByRole("link", { name: "Home" })).toBeVisible();
  await tabs.getByRole("link", { name: "Locations" }).click();
  await expect(page).toHaveURL(/dashboard\/locations/);
  await expect(tabs.getByRole("link", { name: "Locations" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Billing" })).toBeVisible();
});

test("login page shows a show/hide password toggle", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /Show/ }).click();
  await expect(password).toHaveAttribute("type", "text");
});

test("customer can show WireGuard QR for a connection", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("customer@northstar.local");
  await page.getByLabel("Password").fill("CustomerDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  // Ensure at least one connection exists via Quick Connect if needed
  const devicesLink = page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Devices" });
  await devicesLink.click();
  await expect(page).toHaveURL(/dashboard\/vpn/);

  if ((await page.getByRole("button", { name: "Show QR" }).count()) === 0) {
    await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /^(Dashboard|Home)$/ }).click();
    await page.getByRole("button", { name: /Connect & download|Connect/i }).first().click();
    await devicesLink.click();
  }

  await page.getByRole("button", { name: "Show QR" }).first().click();
  await expect(page.getByRole("dialog", { name: /QR code/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/i })).toBeVisible();
});
