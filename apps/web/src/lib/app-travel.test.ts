import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, migrate, users } from "@northstar/db";
import { MockEsimProvider } from "@northstar/esim-provider";
import { createPartnerAdapters } from "@northstar/travel-partners";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ctx = vi.hoisted(() => ({
  db: null as unknown,
  authorization: null as string | null,
}));

vi.mock("@/lib/providers", () => ({
  getDb: () => ctx.db,
  getEnv: () => ({ AUTH_SECRET: "test-secret-test-secret-test-secret" }),
  isProduction: () => false,
  getEsimProvider: () => new MockEsimProvider(),
  getTravelPartners: () => createPartnerAdapters(["mock"], { travelBaseUrl: "https://travel.example.com" }),
  appUrl: (p: string) => `https://${p}.example.com`,
  track: () => undefined,
}));

// The app sends no cookies and no product host header, only its bearer token.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(ctx.authorization ? { authorization: ctx.authorization } : {}),
}));

import { hashPassword } from "@/lib/auth";
import { POST as signIn } from "@/app/api/app/session/route";
import { GET as destinations } from "@/app/api/travel/destinations/route";
import { GET as destination } from "@/app/api/travel/destinations/[slug]/route";
import { GET as listTrips, POST as createTrip } from "@/app/api/travel/trips/route";
import { DELETE as deleteTrip, GET as getTrip, PATCH as patchTrip } from "@/app/api/travel/trips/[id]/route";
import { GET as tripConnectivity } from "@/app/api/travel/trips/[id]/connectivity/route";
import { GET as airportsRoute } from "@/app/api/travel/airports/route";
import { GET as flightsRoute } from "@/app/api/travel/search/flights/route";
import { GET as staysRoute } from "@/app/api/travel/search/stays/route";
import { GET as carsRoute } from "@/app/api/travel/search/cars/route";
import { GET as packagesRoute } from "@/app/api/travel/search/packages/route";
import { GET as priceMapRoute } from "@/app/api/travel/price-map/route";
import { GET as randomTripRoute } from "@/app/api/travel/random-trip/route";
import { addDays, todayInUk } from "@northstar/travel-search";

function body(url: string, method: string, data: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

async function addUser(db: ReturnType<typeof createDb>["db"], id: string, username: string) {
  await db.insert(users).values({
    id,
    username,
    email: `${username}@test.local`,
    passwordHash: await hashPassword("correct horse"),
    role: "customer",
    lifecycle: "customer",
    referralCode: `R-${id}`,
  });
}

async function signedInAs(username: string) {
  ctx.authorization = null;
  const res = await signIn(body("http://vpn.local/api/app/session", "POST", { login: username, password: "correct horse" }));
  const { token } = (await res.json()) as { token: string };
  ctx.authorization = `Bearer ${token}`;
}

describe("Travel API from the native app", () => {
  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-app-travel-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    const db = createDb(url).db;
    ctx.db = db;
    ctx.authorization = null;
    await addUser(db, "u1", "alice");
    await addUser(db, "u2", "bob");
  });

  it("keeps Travel routes off the VPN host for browsers", async () => {
    expect((await destinations()).status).toBe(404);
    expect((await listTrips()).status).toBe(404);
  });

  it("lists destinations and shows one with our eSIM packages", async () => {
    await signedInAs("alice");
    const list = (await (await destinations()).json()) as { destinations: Array<{ slug: string }> };
    expect(list.destinations).toHaveLength(10);

    const japan = (await (await destination(new Request("http://x"), params({ slug: "japan" }))).json()) as {
      destination: { countryCode: string; entryRequirementsUrl: string; reviewed: boolean };
      esim: { available: boolean; packages: unknown[]; plansUrl: string };
      partners: { notice: string; groups: Array<{ category: string; links: Array<{ url: string; label: string; test: boolean }> }> };
    };
    expect(japan.destination.countryCode).toBe("JP");
    expect(japan.destination.reviewed).toBe(false);
    expect(japan.esim.packages.length).toBeGreaterThan(0);
    expect(japan.esim.plansUrl).toBe("https://esim.example.com/pricing?country=JP");
    expect(japan.partners.notice).toMatch(/commission/);
    expect(japan.partners.groups.map((g) => g.category)).toEqual([
      "flights",
      "stays",
      "cars",
      "transfers",
      "activities",
      "parking",
    ]);
    const flight = japan.partners.groups[0]!.links[0]!;
    expect(flight.url).toMatch(/^https:\/\/travel\.example\.com\/go\/lnk_[0-9a-f]{24}$/);
    expect(flight.label).toBe("Search flights to Japan on Test Partner");
    expect(flight.test).toBe(true);

    expect((await destination(new Request("http://x"), params({ slug: "atlantis" }))).status).toBe(404);
  });

  it("saves, edits and deletes a trip", async () => {
    await signedInAs("alice");
    const created = await createTrip(
      body("http://x/api/travel/trips", "POST", {
        destinationSlug: "japan",
        startDate: "2027-04-01",
        endDate: "2027-04-21",
        notes: "  Cherry blossom  ",
      }),
    );
    expect(created.status).toBe(201);
    const { trip } = (await created.json()) as { trip: { id: string; notes: string; destination: { name: string } } };
    expect(trip.destination.name).toBe("Japan");
    expect(trip.notes).toBe("Cherry blossom");

    const patched = await patchTrip(body("http://x", "PATCH", { notes: "", endDate: "2027-04-14" }), params({ id: trip.id }));
    const after = (await patched.json()) as { trip: { notes: string | null; endDate: string; startDate: string } };
    expect(after.trip).toMatchObject({ notes: null, endDate: "2027-04-14", startDate: "2027-04-01" });

    const list = (await (await listTrips()).json()) as { trips: unknown[] };
    expect(list.trips).toHaveLength(1);

    expect((await deleteTrip(new Request("http://x"), params({ id: trip.id }))).status).toBe(200);
    expect((await getTrip(new Request("http://x"), params({ id: trip.id }))).status).toBe(404);
  });

  it("suggests an eSIM for a saved trip's dates, and only to its owner", async () => {
    await signedInAs("alice");
    const created = await createTrip(
      body("http://x/api/travel/trips", "POST", { destinationSlug: "usa", startDate: "2027-05-01", endDate: "2027-05-06" }),
    );
    const { trip } = (await created.json()) as { trip: { id: string } };
    const res = await tripConnectivity(new Request("http://x"), params({ id: trip.id }));
    expect(res.status).toBe(200);
    const { connectivity } = (await res.json()) as {
      connectivity: {
        available: boolean;
        tripDays: number;
        covers: boolean;
        suggested: { code: string; price: number } | null;
        others: Array<{ code: string }>;
        plansUrl: string;
        steps: string[];
      };
    };
    expect(connectivity).toMatchObject({ available: true, tripDays: 6, covers: true });
    expect(connectivity.suggested?.code).toBe("MOCK-US-1GB-7D");
    expect(connectivity.others.map((p) => p.code)).toContain("MOCK-US-5GB-30D");
    expect(connectivity.plansUrl).toBe("https://esim.example.com/pricing?country=US");
    expect(connectivity.steps.length).toBeGreaterThan(0);

    await signedInAs("bob");
    expect((await tripConnectivity(new Request("http://x"), params({ id: trip.id }))).status).toBe(404);
  });

  it("refuses bad input", async () => {
    await signedInAs("alice");
    const bad = [
      { destinationSlug: "atlantis" },
      { destinationSlug: "japan", startDate: "2027-02-30" },
      { destinationSlug: "japan", startDate: "2027-04-10", endDate: "2027-04-01" },
      { destinationSlug: "japan", notes: "x".repeat(2001) },
      { destinationSlug: "japan", userId: "u2" },
    ];
    for (const input of bad) {
      const res = await createTrip(body("http://x/api/travel/trips", "POST", input));
      expect(res.status, JSON.stringify(input).slice(0, 60)).toBe(400);
    }
  });

  it("never shows or changes another person's trip", async () => {
    await signedInAs("alice");
    const res = await createTrip(body("http://x/api/travel/trips", "POST", { destinationSlug: "spain" }));
    const { trip } = (await res.json()) as { trip: { id: string } };

    await signedInAs("bob");
    expect((await (await listTrips()).json()) as { trips: unknown[] }).toEqual({ trips: [] });
    expect((await getTrip(new Request("http://x"), params({ id: trip.id }))).status).toBe(404);
    expect((await patchTrip(body("http://x", "PATCH", { notes: "mine" }), params({ id: trip.id }))).status).toBe(404);
    expect((await deleteTrip(new Request("http://x"), params({ id: trip.id }))).status).toBe(404);

    await signedInAs("alice");
    expect((await getTrip(new Request("http://x"), params({ id: trip.id }))).status).toBe(200);
  });

  describe("search with estimates", () => {
    const depart = addDays(todayInUk(), 60);
    const back = addDays(depart, 7);
    const get = (path: string) => new Request(`http://x${path}`);

    it("needs the app or the Travel host", async () => {
      expect((await airportsRoute()).status).toBe(404);
      expect((await flightsRoute(get(`/api/travel/search/flights?from=EDI&to=BCN&depart=${depart}`))).status).toBe(404);
    });

    it("lists airports for the forms", async () => {
      await signedInAs("alice");
      const json = (await (await airportsRoute()).json()) as { origins: Array<{ code: string }>; destinations: Array<{ destinationSlug: string }> };
      expect(json.origins.map((a) => a.code)).toContain("EDI");
      expect(json.destinations.every((a) => a.destinationSlug)).toBe(true);
    });

    it("labels every answer as an estimate", async () => {
      await signedInAs("alice");
      const answers = await Promise.all([
        flightsRoute(get(`/api/travel/search/flights?from=edi&to=BCN&depart=${depart}&return=${back}&adults=2&sort=cheapest`)),
        staysRoute(get(`/api/travel/search/stays?city=BCN&checkIn=${depart}&checkOut=${back}`)),
        carsRoute(get(`/api/travel/search/cars?city=BCN&pickUp=${depart}&dropOff=${back}`)),
        packagesRoute(get(`/api/travel/search/packages?from=EDI&to=BCN&depart=${depart}&return=${back}`)),
        priceMapRoute(get(`/api/travel/price-map?from=EDI&month=${depart.slice(0, 7)}`)),
      ]);
      for (const res of answers) {
        expect(res.status).toBe(200);
        const json = (await res.json()) as { estimate: boolean; note: string };
        expect(json.estimate).toBe(true);
        expect(json.note).toMatch(/Estimates/);
      }
      const flights = (await (await flightsRoute(
        get(`/api/travel/search/flights?from=EDI&to=BCN&depart=${depart}&return=${back}&adults=2&sort=cheapest`),
      )).json()) as { options: Array<{ pricePerPersonMinor: number; totalMinor: number; inbound: unknown }> };
      expect(flights.options[0]!.totalMinor).toBe(flights.options[0]!.pricePerPersonMinor * 2);
      expect(flights.options[0]!.inbound).not.toBeNull();
    });

    it("plans a random trip with partner links for things to do", async () => {
      expect((await randomTripRoute(get("/api/travel/random-trip?from=EDI&seed=a"))).status).toBe(404);
      await signedInAs("alice");
      const month = depart.slice(0, 7);
      const res = await randomTripRoute(get(`/api/travel/random-trip?from=EDI&region=europe&month=${month}&budget=900&seed=a1`));
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        estimate: boolean;
        trip: { depart: string; perPersonMinor: number; current: { where: string }; upgrades: unknown[] };
        thingsToDo: { notice: string; links: Array<{ label: string; url: string }> };
      };
      expect(json.estimate).toBe(true);
      expect(json.trip.depart.startsWith(month)).toBe(true);
      expect(json.trip.perPersonMinor).toBeLessThanOrEqual(900_00);
      expect(json.thingsToDo.notice).toMatch(/commission/);
      expect(json.thingsToDo.links[0]!.label).toMatch(/^Search things to do in .+ on Test Partner$/);
      expect(json.thingsToDo.links[0]!.url).toMatch(/^https:\/\/travel\.example\.com\/go\/lnk_/);

      const locked = await randomTripRoute(
        get(`/api/travel/random-trip?from=EDI&region=europe&month=${month}&budget=900&seed=a1&rollWhere=5&lockWhere=${json.trip.current.where}`),
      );
      expect(((await locked.json()) as { trip: { current: { where: string } } }).trip.current.where).toBe(json.trip.current.where);

      const tooLow = await randomTripRoute(get(`/api/travel/random-trip?from=EDI&region=asia&budget=50&seed=a1`));
      expect(tooLow.status).toBe(400);
      expect(((await tooLow.json()) as { error: string }).error).toMatch(/^Nothing fits £50 per person/);
    });

    it("explains a search it can't estimate", async () => {
      await signedInAs("alice");
      const past = await flightsRoute(get("/api/travel/search/flights?from=EDI&to=BCN&depart=2020-01-01"));
      expect(past.status).toBe(400);
      expect(((await past.json()) as { error: string }).error).toBe("The departure date is in the past.");
      const bad = await staysRoute(get(`/api/travel/search/stays?city=BARCELONA&checkIn=${depart}&checkOut=${back}`));
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as { error: string }).error).toMatch(/^City: /);
    });
  });
});
