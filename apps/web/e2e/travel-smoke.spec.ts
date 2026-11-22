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

test("a destination's partner links say we may earn a commission and go through /go/", async ({ page }) => {
  await page.goto(`${ORIGIN}/destinations/japan`);
  await expect(page.getByRole("note")).toContainText(/may earn a commission/);
  const flights = page.getByRole("list", { name: /Flights partners for Japan/ });
  const link = flights.getByRole("link", { name: "Search flights to Japan on Test Partner" });
  await expect(link).toHaveAttribute("href", /^\/go\/lnk_[0-9a-f]{24}$/);
  await expect(link).toHaveAttribute("rel", /sponsored/);
  await link.click();
  await expect(page).toHaveURL(/\/partner-preview\?category=flights&destination=japan&subid=clk_[0-9a-f]{16}$/);
  await expect(page.getByRole("heading", { name: /partner.s site would open/ })).toBeVisible();

  const missing = await page.request.get(`${ORIGIN}/go/lnk_000000000000000000000000`, { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
});

test("travel host has no dashboard, and other hosts have no travel pages", async ({ page }) => {
  await page.goto(`${ORIGIN}/dashboard`);
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

test("a signed-in person saves a trip and sees it under My trips", async ({ page }) => {
  await page.goto(`${ORIGIN}/destinations/greece`);
  await expect(page.getByText(/to save Greece to your trips/)).toBeVisible();

  await page.goto(`${ORIGIN}/login`);
  await page.getByLabel("Username or email").fill("customer@northstar.local");
  await page.getByLabel("Password").fill("CustomerDev123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page).toHaveURL(`${ORIGIN}/trips`);
  await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

  const note = `e2e ${Date.now()}`;
  await page.goto(`${ORIGIN}/destinations/greece`);
  await page.getByLabel("From (optional)").fill("2027-06-01");
  await page.getByLabel("To (optional)").fill("2027-06-08");
  await page.getByLabel("Notes (optional)").fill(note);
  await page.getByRole("button", { name: "Save Greece trip" }).click();
  await expect(page).toHaveURL(`${ORIGIN}/trips`);

  const trip = page.getByRole("listitem").filter({ hasText: note });
  await expect(trip.getByText("1 Jun 2027 – 8 Jun 2027 (7 nights)")).toBeVisible();
  await trip.getByRole("button", { name: "Delete Greece trip" }).click();
  await trip.getByRole("button", { name: "Delete Greece trip" }).click();
  await expect(page.getByText(note)).toHaveCount(0);
});

test("search gives labelled estimates, and Surprise me plans a whole trip", async ({ page }) => {
  await page.goto(`${ORIGIN}/search?type=stays`);
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
  await page.getByLabel("Where").selectOption("BCN");
  await page.getByRole("button", { name: "Search" }).click();
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("note")).toHaveText(/Estimates, not live prices/);
  await expect(results.getByText(/est\.$/).first()).toBeVisible();

  await page.getByRole("link", { name: "Surprise me" }).click();
  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(page.getByText(/per person$/).first()).toBeVisible();
  await page.getByRole("link", { name: "Another stay" }).click();
  await expect(page).toHaveURL(/rollStay=1/);
});
