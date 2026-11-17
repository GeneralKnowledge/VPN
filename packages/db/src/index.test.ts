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
