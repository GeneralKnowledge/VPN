import { expect, test } from "@playwright/test";

/** Travel Hub host. Like the eSIM suite, it selects the host with x-forwarded-host (trusted in e2e). */
const ORIGIN = "http://127.0.0.1:3000";

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-host": "travel.localhost" });
});

test("travel host shows its own brand and the destinations", async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByRole("link", { name: /Northstar Travel/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Plan the trip/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Japan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /United Arab Emirates/ })).toBeVisible();
});

test("a destination page shows essentials, our eSIM plans and a budget", async ({ page }) => {
  await page.goto(`${ORIGIN}/destinations/japan`);
  await expect(page.getByRole("heading", { name: "Japan", level: 1 })).toBeVisible();
  await expect(page.getByText("Japanese yen (JPY)")).toBeVisible();
  await expect(page.getByRole("link", { name: /entry requirements for Japan/i })).toHaveAttribute(
    "href",
    "https://www.gov.uk/foreign-travel-advice/japan/entry-requirements",
  );

  const plans = page.getByRole("list", { name: /eSIM plans for Japan/i });
  await expect(plans.getByRole("listitem").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /See Japan plans on Northstar SIM/i })).toHaveAttribute(
    "href",
    /\/pricing\?country=JP$/,
  );

  await page.getByLabel("Nights").fill("10");
  await page.getByLabel(/Per night/).fill("100");
  await page.getByLabel("eSIM", { exact: true }).selectOption("");
  await expect(page.getByText("£1,000.00")).toBeVisible();
});

test("travel host has no sign-in or dashboard yet, and other hosts have no travel pages", async ({ page }) => {
  await page.goto(`${ORIGIN}/login`);
  await expect(page).toHaveURL(`${ORIGIN}/`);

  await page.setExtraHTTPHeaders({});
  await page.goto(`${ORIGIN}/travel/destinations/japan`);
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.getByRole("link", { name: /Northstar VPN/i }).first()).toBeVisible();
});

test("destinations API answers on the travel host only", async ({ request }) => {
  const travel = await request.get(`${ORIGIN}/api/travel/destinations/japan`, {
    headers: { "x-forwarded-host": "travel.localhost" },
  });
  expect(travel.status()).toBe(200);
  const body = await travel.json();
  expect(body.destination.countryCode).toBe("JP");
  expect(body.esim.packages.length).toBeGreaterThan(0);

  const vpn = await request.get(`${ORIGIN}/api/travel/destinations`);
  expect(vpn.status()).toBe(404);
});

test("travel host serves its own sitemap and robots", async ({ request }) => {
  const headers = { "x-forwarded-host": "travel.localhost" };
  const sitemap = await (await request.get(`${ORIGIN}/sitemap.xml`, { headers })).text();
  expect(sitemap).toContain("/destinations/japan");
  expect(sitemap).not.toContain("/download");
  const robots = await (await request.get(`${ORIGIN}/robots.txt`, { headers })).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).not.toContain("/dashboard/");
});
