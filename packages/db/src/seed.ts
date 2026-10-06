import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { plans as planCatalog } from "@northstar/config";
import { MOCK_LOCATIONS } from "@northstar/vpn-provider";
import { createDb } from "./client";
import { migrate } from "./migrate";
import * as schema from "./schema";

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function referralCode(): string {
  return `NORTH-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function monorepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export async function seed() {
  process.env.NORTHSTAR_ROOT = process.env.NORTHSTAR_ROOT ?? monorepoRoot();
  const databaseUrl = process.env.DATABASE_URL ?? "file:./data/northstar.db";
  migrate(databaseUrl);

  const { db, sqlite } = createDb(databaseUrl);

  // Clear for deterministic seed in development
  const tables = [
    "support_messages",
    "support_tickets",
    "referrals",
    "devices",
    "vpn_connections",
    "vpn_accounts",
    "vpn_locations",
    "payments",
    "invoices",
    "checkout_sessions",
    "subscriptions",
    "webhook_events",
    "provider_events",
    "audit_events",
    "verification_tokens",
    "sessions",
    "plans",
    "users",
  ];
  sqlite.exec("PRAGMA foreign_keys = OFF;");
  for (const t of tables) sqlite.exec(`DELETE FROM ${t};`);
  sqlite.exec("PRAGMA foreign_keys = ON;");

  for (const plan of planCatalog) {
    await db.insert(schema.plans).values({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      featuresJson: JSON.stringify(plan.features),
      maxDevices: plan.maxDevices,
      active: plan.active,
    });
  }

  for (const loc of MOCK_LOCATIONS) {
    await db.insert(schema.vpnLocations).values({
      id: loc.id,
      providerId: loc.providerId,
      country: loc.country,
      countryCode: loc.countryCode,
      city: loc.city,
      region: loc.region ?? null,
      hostname: loc.hostname,
      status: loc.status,
      protocolSupportJson: JSON.stringify(loc.protocolSupport),
      latency: loc.latency ?? null,
      load: loc.load ?? null,
      isFixture: true,
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@northstar.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "AdminDev123!";
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? "customer@northstar.local";
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "CustomerDev123!";

  const adminId = id("user");
  const customerId = id("user");
  const customer2Id = id("user");

  await db.insert(schema.users).values([
    {
      id: adminId,
      email: adminEmail,
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: "Northstar Admin",
      role: "admin",
      lifecycle: "active",
      referralCode: referralCode(),
    },
    {
      id: customerId,
      email: customerEmail,
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash(customerPassword, 10),
      name: "Ada Customer",
      role: "customer",
      lifecycle: "active",
      referralCode: referralCode(),
    },
    {
      id: customer2Id,
      email: "lead@northstar.local",
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash("LeadDev123!", 10),
      name: "Lee Lead",
      role: "customer",
      lifecycle: "customer",
      referralCode: referralCode(),
      referredByUserId: customerId,
    },
  ]);

  await db.insert(schema.referrals).values({
    id: id("ref"),
    referrerUserId: customerId,
    referredUserId: customer2Id,
    status: "pending",
  });

  // Extra users so the referral leaderboard has something to show in mock mode
  const rivalId = id("user");
  const paidFriendIds = [id("user"), id("user"), id("user")];
  const friendHash = await bcrypt.hash("FriendDev123!", 10);
  await db.insert(schema.users).values([
    {
      id: rivalId,
      email: "river@northstar.local",
      emailVerifiedAt: new Date(),
      passwordHash: await bcrypt.hash("RiverDev123!", 10),
      name: "River Referrer",
      role: "customer",
      lifecycle: "active",
      referralCode: referralCode(),
    },
    ...paidFriendIds.map((fid, i) => ({
      id: fid,
      email: `friend${i + 1}@northstar.local`,
      emailVerifiedAt: new Date(),
      passwordHash: friendHash,
      name: `Friend ${i + 1}`,
      role: "customer" as const,
      lifecycle: "active" as const,
      referralCode: referralCode(),
      referredByUserId: rivalId,
    })),
  ]);

  await db.insert(schema.referrals).values(
    paidFriendIds.map((fid) => ({
      id: id("ref"),
      referrerUserId: rivalId,
      referredUserId: fid,
      status: "rewarded" as const,
      convertedAt: new Date(),
      rewardJson: JSON.stringify({
        type: "free_premium_months",
        months: 1,
        planId: "premium-referral",
        threshold: 3,
      }),
    })),
  );

  // Ada has two converted (not yet rewarded) so leaderboard shows progress
  const adaFriends = [id("user"), id("user")];
  await db.insert(schema.users).values(
    adaFriends.map((fid, i) => ({
      id: fid,
      email: `adafriend${i + 1}@northstar.local`,
      emailVerifiedAt: new Date(),
      passwordHash: friendHash,
      name: `AdaFriend ${i + 1}`,
      role: "customer" as const,
      lifecycle: "active" as const,
      referralCode: referralCode(),
      referredByUserId: customerId,
    })),
  );
  await db.insert(schema.referrals).values(
    adaFriends.map((fid) => ({
      id: id("ref"),
      referrerUserId: customerId,
      referredUserId: fid,
      status: "converted" as const,
      convertedAt: new Date(),
    })),
  );

  const subId = id("sub");
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  await db.insert(schema.subscriptions).values({
    id: subId,
    userId: customerId,
    planId: "premium-monthly",
    status: "active",
    provider: "mock",
    providerSubscriptionId: id("sub_mock"),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });

  const vpnAccountId = id("vpn");
  await db.insert(schema.vpnAccounts).values({
    id: vpnAccountId,
    userId: customerId,
    provider: "mock",
    providerAccountId: id("pva"),
    username: `ns_${customerId.slice(-8)}`,
    status: "active",
    provisionAttempts: 1,
  });

  const connId = id("conn");
  await db.insert(schema.vpnConnections).values({
    id: connId,
    userId: customerId,
    vpnAccountId,
    locationId: "mock-uk-london",
    name: "iPhone",
    protocol: "wireguard",
    lastUsedAt: new Date(),
  });

  await db.insert(schema.devices).values([
    {
      id: id("dev"),
      userId: customerId,
      connectionId: connId,
      name: "iPhone",
      platform: "ios",
      lastUsedAt: new Date(),
    },
    {
      id: id("dev"),
      userId: customerId,
      name: "Windows PC",
      platform: "windows",
      lastUsedAt: new Date(Date.now() - 86400000),
    },
  ]);

  await db.insert(schema.payments).values({
    id: id("pay"),
    userId: customerId,
    subscriptionId: subId,
    provider: "mock",
    amount: 499,
    currency: "GBP",
    status: "succeeded",
  });

  await db.insert(schema.invoices).values({
    id: id("inv"),
    userId: customerId,
    subscriptionId: subId,
    amount: 499,
    currency: "GBP",
    status: "paid",
  });

  const ticketId = id("tkt");
  await db.insert(schema.supportTickets).values({
    id: ticketId,
    userId: customerId,
    subject: "How do I connect on macOS?",
    status: "open",
  });
  await db.insert(schema.supportMessages).values({
    id: id("msg"),
    ticketId,
    authorId: customerId,
    body: "I downloaded the config but need setup steps for macOS.",
    isStaff: false,
  });

  await db.insert(schema.auditEvents).values([
    {
      id: id("aud"),
      actorId: customerId,
      actorType: "user",
      action: "account.created",
      targetType: "user",
      targetId: customerId,
      metadataJson: JSON.stringify({ email: customerEmail }),
    },
    {
      id: id("aud"),
      actorId: customerId,
      actorType: "user",
      action: "subscription.created",
      targetType: "subscription",
      targetId: subId,
    },
    {
      id: id("aud"),
      actorId: "system",
      actorType: "system",
      action: "vpn.provisioned",
      targetType: "vpn_account",
      targetId: vpnAccountId,
    },
  ]);

  console.info("[db] seed complete");
  console.info(`  Admin:    ${adminEmail} / ${adminPassword}`);
  console.info(`  Customer: ${customerEmail} / ${customerPassword}`);
  console.info(`  Lead:     lead@northstar.local / LeadDev123!`);

  // Avoid unused import lint
  void createHash;
  void eq;

  sqlite.close();
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect || process.argv[1]?.includes("seed")) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
