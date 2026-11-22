import { describe, expect, it } from "vitest";
import { users } from "./schema";

describe("schema", () => {
  it("exports users table", () => {
    expect(users).toBeDefined();
  });
});

describe("payments.product backfill", () => {
  it("labels existing eSIM payments as esim when an old database is migrated", async () => {
    const Database = (await import("better-sqlite3")).default;
    const fsm = await import("node:fs");
    const osm = await import("node:os");
    const pathm = await import("node:path");
    const { migrate: run } = await import("./migrate");
    const dir = fsm.mkdtempSync(pathm.join(osm.tmpdir(), "northstar-product-"));
    const file = pathm.join(dir, "old.db");
    process.env.NORTHSTAR_ROOT = dir;
    run(`file:${file}`);
    // Simulate a database from before the column: drop it by rebuilding payments without it.
    const raw = new Database(file);
    raw.exec(`DROP INDEX IF EXISTS payments_product_idx;
      ALTER TABLE payments DROP COLUMN product;
      INSERT INTO users (id, username, password_hash, referral_code) VALUES ('u1', 'u1', 'x', 'R1');
      INSERT INTO esim_orders (id, user_id, package_code, package_name, country_code, amount, status, billing_provider, esim_provider, provider_payment_id)
        VALUES ('eso_1', 'u1', 'P', 'P', 'GB', 499, 'issued', 'stripe', 'mock', 'pi_esim');
      INSERT INTO payments (id, user_id, provider, provider_payment_id, amount, status) VALUES
        ('pay_e', 'u1', 'stripe', 'pi_esim', 499, 'succeeded'),
        ('pay_v', 'u1', 'stripe', 'in_vpn', 499, 'succeeded');`);
    raw.close();
    run(`file:${file}`);
    const check = new Database(file, { readonly: true });
    const rows = check.prepare(`SELECT id, product FROM payments ORDER BY id`).all();
    check.close();
    expect(rows).toEqual([
      { id: "pay_e", product: "esim" },
      { id: "pay_v", product: "vpn" },
    ]);
  });
});

describe("users from before usernames", () => {
  it("migrates a database whose users table has no username column", async () => {
    const Database = (await import("better-sqlite3")).default;
    const fsm = await import("node:fs");
    const osm = await import("node:os");
    const pathm = await import("node:path");
    const { migrate: run } = await import("./migrate");
    const dir = fsm.mkdtempSync(pathm.join(osm.tmpdir(), "northstar-username-"));
    const file = pathm.join(dir, "old.db");
    process.env.NORTHSTAR_ROOT = dir;
    // The users table as it was before usernames: email required, no username.
    const raw = new Database(file);
    raw.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_verified_at INTEGER,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      lifecycle TEXT NOT NULL DEFAULT 'customer',
      referral_code TEXT NOT NULL,
      referred_by_user_id TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO users (id, email, password_hash, referral_code, created_at) VALUES
      ('u1', 'Jo.Smith@example.com', 'x', 'R1', 1),
      ('u2', 'jo.smith@example.org', 'x', 'R2', 2),
      ('u3', 'jo_smith_u2@example.net', 'x', 'R3', 3);`);
    raw.close();
    run(`file:${file}`);
    const check = new Database(file, { readonly: true });
    const rows = check.prepare(`SELECT id, username, email FROM users ORDER BY id`).all();
    const index = check.prepare(`SELECT name FROM sqlite_master WHERE name = 'users_username_uidx'`).get();
    check.close();
    // Two emails with the same local part still get distinct usernames, and a generated name
    // never takes one that another user's email already gives (u3's "jo_smith_u2").
    expect(rows).toEqual([
      { id: "u1", username: "jo_smith", email: "Jo.Smith@example.com" },
      { id: "u2", username: "jo_smith_u2_2", email: "jo.smith@example.org" },
      { id: "u3", username: "jo_smith_u2", email: "jo_smith_u2@example.net" },
    ]);
    expect(index).toEqual({ name: "users_username_uidx" });
  });
});

describe("legacyUsernames", () => {
  it("keeps a username someone chose, even when an earlier user's email gives the same name", async () => {
    const { legacyUsernames } = await import("./migrate");
    const names = legacyUsernames([
      { id: "u1", username: null, email: "bob@example.com" },
      { id: "u2", username: "bob", email: "robert@example.org" },
    ]);
    expect(names.get("u2")).toBe("bob");
    expect(names.get("u1")).toBe("bob_u1");
  });
});
