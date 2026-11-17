import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, migrate, users } from "@northstar/db";
import { MockEsimProvider } from "@northstar/esim-provider";
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
    };
    expect(japan.destination.countryCode).toBe("JP");
    expect(japan.destination.reviewed).toBe(false);
    expect(japan.esim.packages.length).toBeGreaterThan(0);
    expect(japan.esim.plansUrl).toBe("https://esim.example.com/pricing?country=JP");

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
});
