import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb, migrate, users, type Db } from "@northstar/db";
import { createEsimProvider } from "@northstar/esim-provider";
import { createEmailProvider } from "@northstar/email";
import { completeEsimOrder, createEsimCheckoutOrder, listUserEsimOrders } from "./esim-services";
import { newId } from "./utils";

describe("esim checkout → issue", () => {
  let db: Db;
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
  });

  async function setup() {
    const dir = mkdtempSync(path.join(tmpdir(), "northstar-esim-"));
    const url = `file:${path.join(dir, "t.db")}`;
    process.env.NORTHSTAR_ROOT = dir;
    migrate(url);
    const client = createDb(url);
    db = client.db;
    close = client.close;
    const userId = newId("usr");
    await db.insert(users).values({
      id: userId,
      email: "esim@test.local",
      passwordHash: "x",
      role: "customer",
      lifecycle: "customer",
      referralCode: `SIM-${userId.slice(-6)}`,
    });
    return userId;
  }

  it("creates a pending order and issues after mock payment", async () => {
    const userId = await setup();
    const esim = createEsimProvider("mock");
    const email = createEmailProvider("mock");
    const packages = await esim.listPackages({ country: "GB" });
    const pkg = packages[0]!;

    const created = await createEsimCheckoutOrder(db, esim, {
      userId,
      packageCode: pkg.code,
      billingProvider: "mock",
      esimProviderKind: "mock",
      correlationId: "c1",
    });
    expect(created.checkoutId).toBeTruthy();

    const result = await completeEsimOrder(db, esim, email, {
      checkoutId: created.checkoutId,
      userId,
      correlationId: "c1",
    });
    expect(result.order.status).toBe("issued");

    const listed = await listUserEsimOrders(db, userId);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.profile?.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(listed[0]!.profile?.iccid).toBeTruthy();
  });
});
