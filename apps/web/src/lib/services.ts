import { nextLifecycleAfterPayment, nextLifecycleAfterVpnProvisioned } from "@northstar/billing";
import {
  auditEvents,
  payments,
  providerEvents,
  subscriptions,
  users,
  vpnAccounts,
  type Db,
} from "@northstar/db";
import { eq } from "drizzle-orm";
import type { VPNProvider } from "@northstar/vpn-provider";
import type { EmailProvider } from "@northstar/email";
import { writeAudit } from "./auth";
import { newId } from "./utils";

/**
 * Provision VPN after successful subscription.
 * Idempotent: if account exists and active, returns it.
 * On provider failure, records pending/error for reconciliation.
 */
export async function provisionVpnForUser(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  userId: string,
  correlationId: string,
) {
  const existing = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (existing[0]?.status === "active") {
    return existing[0];
  }

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const username = `ns_${userId.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}`;
  const password = `Tmp_${newId("pwd").slice(0, 12)}`;

  const attempts = (existing[0]?.provisionAttempts ?? 0) + 1;

  try {
    const account = existing[0]
      ? await vpn.getAccount(existing[0].providerAccountId).catch(async () =>
          vpn.createAccount({
            username: `${username}_${attempts}`,
            password,
            externalCustomerId: userId,
          }),
        )
      : await vpn.createAccount({
          username,
          password,
          externalCustomerId: userId,
        });

    const row = {
      id: existing[0]?.id ?? newId("vpn"),
      userId,
      provider: "configured",
      providerAccountId: account.providerAccountId,
      username: account.username,
      status: "active" as const,
      lastError: null as string | null,
      provisionAttempts: attempts,
      updatedAt: new Date(),
    };

    if (existing[0]) {
      await db.update(vpnAccounts).set(row).where(eq(vpnAccounts.id, existing[0].id));
    } else {
      await db.insert(vpnAccounts).values({ ...row, createdAt: new Date() });
    }

    const lifecycle = nextLifecycleAfterVpnProvisioned(
      user.lifecycle as Parameters<typeof nextLifecycleAfterVpnProvisioned>[0],
    );
    const finalLifecycle = nextLifecycleAfterVpnProvisioned(lifecycle);
    await db.update(users).set({ lifecycle: finalLifecycle, updatedAt: new Date() }).where(eq(users.id, userId));

    await db.insert(providerEvents).values({
      id: newId("pev"),
      provider: "vpn",
      direction: "outbound",
      action: "account.provision",
      status: "success",
      targetId: row.id,
      correlationId,
    });

    await writeAudit(db, {
      actorId: "system",
      actorType: "system",
      action: "vpn.provisioned",
      targetType: "vpn_account",
      targetId: row.id,
      correlationId,
      metadata: { userId },
    });

    await email.send({
      to: user.email,
      template: "vpn_provisioned",
      vars: { name: user.name ?? "there" },
      correlationId,
    });

    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning failed";
    if (existing[0]) {
      await db
        .update(vpnAccounts)
        .set({
          status: "error",
          lastError: message,
          provisionAttempts: attempts,
          updatedAt: new Date(),
        })
        .where(eq(vpnAccounts.id, existing[0].id));
    } else {
      await db.insert(vpnAccounts).values({
        id: newId("vpn"),
        userId,
        provider: "configured",
        providerAccountId: `pending_${userId}`,
        username,
        status: "error",
        lastError: message,
        provisionAttempts: attempts,
      });
    }
    await db.insert(providerEvents).values({
      id: newId("pev"),
      provider: "vpn",
      direction: "outbound",
      action: "account.provision",
      status: "error",
      targetId: userId,
      metadataJson: JSON.stringify({ message }),
      correlationId,
    });
    throw err;
  }
}

/**
 * After mock/stripe checkout success: create subscription + provision VPN.
 */
export async function activateSubscription(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  input: {
    userId: string;
    planId: string;
    providerSubscriptionId: string;
    provider: "mock" | "stripe";
    amount: number;
    correlationId: string;
  },
) {
  const userRows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const existingSubs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, input.userId));
  const active = existingSubs.find((s) => s.status === "active" || s.status === "trialing");
  if (active) {
    await provisionVpnForUser(db, vpn, email, input.userId, input.correlationId);
    return active;
  }

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + (input.planId.includes("annual") ? 12 : 1));
  const subId = newId("sub");
  await db.insert(subscriptions).values({
    id: subId,
    userId: input.userId,
    planId: input.planId,
    status: "active",
    provider: input.provider,
    providerSubscriptionId: input.providerSubscriptionId,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });

  await db.insert(payments).values({
    id: newId("pay"),
    userId: input.userId,
    subscriptionId: subId,
    provider: input.provider,
    providerPaymentId: input.providerSubscriptionId,
    amount: input.amount,
    currency: "GBP",
    status: "succeeded",
  });

  const lifecycle = nextLifecycleAfterPayment(user.lifecycle as Parameters<typeof nextLifecycleAfterPayment>[0]);
  await db.update(users).set({ lifecycle, updatedAt: new Date() }).where(eq(users.id, input.userId));

  await writeAudit(db, {
    actorId: input.userId,
    actorType: "user",
    action: "subscription.created",
    targetType: "subscription",
    targetId: subId,
    correlationId: input.correlationId,
  });

  await email.send({
    to: user.email,
    template: "subscription_started",
    vars: { name: user.name ?? "there", planName: input.planId },
    correlationId: input.correlationId,
  });

  await provisionVpnForUser(db, vpn, email, input.userId, input.correlationId);

  await db
    .update(users)
    .set({ lifecycle: "active", updatedAt: new Date() })
    .where(eq(users.id, input.userId));

  return (await db.select().from(subscriptions).where(eq(subscriptions.id, subId)))[0]!;
}

/** Find users with paid subscription but missing/failed VPN and retry. */
export async function reconcileVpnProvisioning(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  correlationId: string,
) {
  const allSubs = await db.select().from(subscriptions);
  const activeUserIds = new Set(
    allSubs.filter((s) => s.status === "active" || s.status === "trialing").map((s) => s.userId),
  );
  const accounts = await db.select().from(vpnAccounts);
  const byUser = new Map(accounts.map((a) => [a.userId, a]));
  const repaired: string[] = [];

  for (const userId of activeUserIds) {
    const account = byUser.get(userId);
    if (!account || account.status === "error" || account.status === "pending") {
      try {
        await provisionVpnForUser(db, vpn, email, userId, correlationId);
        repaired.push(userId);
      } catch {
        // left for next pass
      }
    }
  }
  return { repaired };
}

void auditEvents;
