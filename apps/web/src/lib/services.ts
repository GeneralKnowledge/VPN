import { nextLifecycleAfterPayment, nextLifecycleAfterVpnProvisioned } from "@northstar/billing";
import { referralProgram } from "@northstar/config";
import {
  auditEvents,
  payments,
  providerEvents,
  subscriptions,
  users,
  vpnAccounts,
  type Db,
} from "@northstar/db";
import { and, eq, inArray } from "drizzle-orm";
import type { EmailProvider } from "@northstar/email";
import { VpnProviderError, type VPNProvider, type VpnAccount } from "@northstar/vpn-provider";
import { writeAudit } from "./auth";
import { onReferredUserPaid } from "./referrals";
import { newId } from "./utils";

/** How long a `pending` claim may block other workers before it is considered stale. */
const PENDING_STALE_MS = 120_000;

function isPlaceholderProviderId(providerAccountId: string): boolean {
  return providerAccountId.startsWith("pending_");
}

function deterministicUsername(userId: string): string {
  // Stable per user — never invent new usernames on retry (avoids paid duplicate accounts).
  return `ns_${userId.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}`;
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique|UNIQUE|constraint/i.test(message);
}

type VpnAccountRow = typeof vpnAccounts.$inferSelect;

/**
 * Obtain the single vpn_accounts row for this user before any provider create.
 * Uses the unique(userId) index as a mutex: only one caller wins the insert/claim.
 */
async function claimVpnAccountRow(db: Db, userId: string, username: string): Promise<{
  row: VpnAccountRow;
  wonClaim: boolean;
}> {
  const existing = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (existing[0]) {
    if (existing[0].status === "active" || existing[0].status === "disabled") {
      return { row: existing[0], wonClaim: false };
    }

    const stalePending =
      existing[0].status === "pending" &&
      existing[0].updatedAt.getTime() < Date.now() - PENDING_STALE_MS;

    if (existing[0].status === "pending" && !stalePending) {
      return { row: existing[0], wonClaim: false };
    }

    // Take ownership of error / stale pending for a safe retry (still one row).
    const updated = await db
      .update(vpnAccounts)
      .set({
        status: "pending",
        lastError: null,
        provisionAttempts: existing[0].provisionAttempts + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vpnAccounts.id, existing[0].id),
          inArray(vpnAccounts.status, ["error", "pending", "expired"]),
        ),
      )
      .returning();

    if (updated[0]) {
      return { row: updated[0], wonClaim: true };
    }

    // Lost CAS — re-read
    const again = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
    if (!again[0]) throw new Error("VPN account row disappeared during claim");
    return { row: again[0], wonClaim: false };
  }

  const id = newId("vpn");
  try {
    await db.insert(vpnAccounts).values({
      id,
      userId,
      provider: "configured",
      providerAccountId: `pending_${userId}`,
      username,
      status: "pending",
      provisionAttempts: 1,
    });
    const [row] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.id, id)).limit(1);
    if (!row) throw new Error("Failed to read claimed VPN account row");
    return { row, wonClaim: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
    if (!again[0]) throw err;
    return { row: again[0], wonClaim: false };
  }
}

/**
 * Resolve the provider account without creating a second billable identity when one
 * already exists. createAccount is only called when we have never stored a real provider id,
 * or the provider confirms not_found.
 */
async function resolveProviderAccount(
  vpn: VPNProvider,
  row: VpnAccountRow,
  username: string,
): Promise<VpnAccount> {
  if (!isPlaceholderProviderId(row.providerAccountId)) {
    try {
      const account = await vpn.getAccount(row.providerAccountId);
      if (account.status === "disabled") {
        return vpn.reactivateAccount(row.providerAccountId);
      }
      return account;
    } catch (err) {
      if (err instanceof VpnProviderError && err.code === "not_found") {
        // Provider confirmed gone — safe to create exactly one replacement.
        return vpn.createAccount({
          username,
          password: `Tmp_${newId("pwd").slice(0, 12)}`,
          externalCustomerId: row.userId,
        });
      }
      // Transient / unknown errors must not trigger a paid createAccount.
      throw err;
    }
  }

  return vpn.createAccount({
    username,
    password: `Tmp_${newId("pwd").slice(0, 12)}`,
    externalCustomerId: row.userId,
  });
}

/**
 * Provision VPN after successful subscription.
 *
 * Money-safe rules:
 * - At most one vpn_accounts row per user (unique index).
 * - Claim that row as `pending` before any createAccount call.
 * - Never mint a new username on retry.
 * - Never createAccount when a real providerAccountId exists unless provider returns not_found.
 * - Concurrent callers that lose the claim do not call createAccount.
 */
export async function provisionVpnForUser(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  userId: string,
  correlationId: string,
) {
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const username = deterministicUsername(userId);
  const { row: claimed, wonClaim } = await claimVpnAccountRow(db, userId, username);

  if (claimed.status === "active") {
    return claimed;
  }

  if (claimed.status === "disabled") {
    // Admin/payment suspension — do not silently re-create a billable account.
    return claimed;
  }

  if (!wonClaim && claimed.status === "pending") {
    // Another worker owns an in-flight provision. Do not create a second provider account.
    return claimed;
  }

  if (!wonClaim) {
    // Lost claim on an error row that another worker already reclaimed.
    return claimed;
  }

  try {
    const account = await resolveProviderAccount(vpn, claimed, username);

    const [row] = await db
      .update(vpnAccounts)
      .set({
        provider: "configured",
        providerAccountId: account.providerAccountId,
        username: account.username,
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(vpnAccounts.id, claimed.id))
      .returning();

    const finalRow = row ?? claimed;

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
      targetId: finalRow.id,
      correlationId,
      metadataJson: JSON.stringify({ providerAccountId: account.providerAccountId }),
    });

    await writeAudit(db, {
      actorId: "system",
      actorType: "system",
      action: "vpn.provisioned",
      targetType: "vpn_account",
      targetId: finalRow.id,
      correlationId,
      metadata: { userId },
    });

    await email.send({
      to: user.email,
      template: "vpn_provisioned",
      vars: { name: user.name ?? "there" },
      correlationId,
    });

    return finalRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning failed";
    await db
      .update(vpnAccounts)
      .set({
        status: "error",
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(vpnAccounts.id, claimed.id));

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

  // Idempotent on provider subscription id when present (webhook retries).
  if (input.providerSubscriptionId) {
    const byProvider = existingSubs.find((s) => s.providerSubscriptionId === input.providerSubscriptionId);
    if (byProvider) {
      await provisionVpnForUser(db, vpn, email, input.userId, input.correlationId);
      return byProvider;
    }
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

  // Paying checkout only — complimentary referral grants must not count as "paid referrals".
  if (input.amount > 0 && input.planId !== referralProgram.rewardPlanId) {
    const { reward } = await onReferredUserPaid(db, email, input.userId, input.correlationId);
    if (reward.granted) {
      await provisionVpnForUser(db, vpn, email, reward.referrerUserId, input.correlationId);
    }
  }

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
    // Never touch admin-disabled accounts. Retry only missing / error / stale pending.
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
