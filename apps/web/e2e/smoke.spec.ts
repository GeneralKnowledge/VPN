import { expect, test } from "@playwright/test";

test("marketing homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Northstar VPN/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Private internet access/i })).toBeVisible();
});

test("customer can log in to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("customer@northstar.local");
  await page.getByLabel("Password").fill("CustomerDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText(/Welcome back/i)).toBeVisible();
});

test("admin can open customers", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@northstar.local");
  await page.getByLabel("Password").fill("AdminDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(/admin/);
  await page.goto("/admin/customers");
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
  await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

  const before = await page.getByRole("button", { pressed: false }).count();
  await page.getByLabel("Search locations").fill("zzzz-no-match");
  await expect(page.getByText("No locations match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("button", { pressed: false }).first()).toBeVisible();
  expect(before).toBeGreaterThan(0);
});

test("login page shows a show/hide password toggle", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /Show/ }).click();
  await expect(password).toHaveAttribute("type", "text");
});
