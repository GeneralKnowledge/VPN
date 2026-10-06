import { expect, test } from "@playwright/test";

test("marketing homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Northstar VPN/i }).first()).toBeVisible();
  await expect(page.getByText(/Private internet access/i)).toBeVisible();
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
