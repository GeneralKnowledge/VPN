import {
  BillingProviderError,
  RENEWAL_GRACE_DAYS,
  canProvisionVpn,
  isLiveSubscriptionStatus,
  nextLifecycleAfterPayment,
  nextLifecycleAfterPaymentFailed,
  nextLifecycleAfterResume,
  nextLifecycleAfterVpnProvisioned,
  type BillingProvider,
  type CustomerLifecycle,
  type SubscriptionStatus,
} from "@northstar/billing";
import {
  devices,
  invoices,
  plans,
  providerEvents,
  payments,
  subscriptions,
  users,
  verificationTokens,
  vpnAccounts,
  vpnConnections,
  vpnLocations,
  type Db,
} from "@northstar/db";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import {
  VpnProviderError,
  type VPNProvider,
  type VpnAccount as ProviderVpnAccount,
} from "@northstar/vpn-provider";
import type { EmailProvider } from "@northstar/email";
import { destroyUserSessions, purgeExpiredSessions, writeAudit } from "./auth";
import { HttpError } from "./http";
import { sendEmailSafe } from "./notify";
import { newId } from "./utils";

function stableUsername(userId: string): string {
  return `ns_${userId.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}`;
}

/** Strong random credential for the provider account; the customer can rotate it from the dashboard. */
export function generateVpnPassword(): string {
  return randomBytes(18).toString("base64url");
}

function pendingProviderId(userId: string): string {
  return `pending_${userId}`;
}

function isRealProviderId(providerAccountId: string): boolean {
  return Boolean(providerAccountId) && !providerAccountId.startsWith("pending_");
}

function mapProviderStatusToLocal(
  status: ProviderVpnAccount["status"],
): "pending" | "active" | "disabled" | "expired" | "error" {
  if (status === "active") return "active";
  if (status === "disabled") return "disabled";
  if (status === "expired") return "expired";
  return "pending";
}

export function formatProviderError(err: unknown, operation: string): string {
  if (err instanceof VpnProviderError) {
    return JSON.stringify({
      ...err.toDiagnostic(),
      operation: err.operation ?? operation,
    });
  }
  return JSON.stringify({
    code: "unknown",
    message: err instanceof Error ? err.message : "Unknown error",
    retryable: true,
    operation,
  });
}

async function recordProviderEvent(
  db: Db,
  input: {
    action: string;
    status: "success" | "error" | "retry";
    targetId?: string;
    correlationId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(providerEvents).values({
    id: newId("pev"),
    provider: "vpn",
    direction: "outbound",
    action: input.action,
    status: input.status,
    targetId: input.targetId,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    correlationId: input.correlationId,
  });
}

/**
 * Provision VPN after successful subscription.
 * Idempotent: stable username; never creates a second provider account on retry.
 * On provider failure, records pending/error for reconciliation.
 */
export async function provisionVpnForUser(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  userId: string,
  correlationId: string,
  options?: { bypassSubscriptionCheck?: boolean },
) {
  const existing = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (existing[0]?.status === "active" && isRealProviderId(existing[0].providerAccountId)) {
    return existing[0];
  }

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  const billingSub = subs.find(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "cancelling",
  );
  if (!options?.bypassSubscriptionCheck) {
    if (!billingSub) {
      throw new Error("Active subscription required for VPN provisioning");
    }
    if (
      !canProvisionVpn(user.lifecycle as CustomerLifecycle, billingSub.status as SubscriptionStatus)
    ) {
      throw new Error("VPN provisioning not allowed for current subscription state");
    }
  }

  const username = existing[0]?.username || stableUsername(userId);
  const password = generateVpnPassword();
  const attempts = (existing[0]?.provisionAttempts ?? 0) + 1;
  const localId = existing[0]?.id ?? newId("vpn");

  // Ensure local row exists before calling the provider (idempotency anchor)
  if (!existing[0]) {
    await db.insert(vpnAccounts).values({
      id: localId,
      userId,
      provider: "configured",
      providerAccountId: pendingProviderId(userId),
      username,
      status: "pending",
      lastError: null,
      provisionAttempts: attempts,
    });
  } else {
    await db
      .update(vpnAccounts)
      .set({
        status: existing[0].status === "active" ? existing[0].status : "pending",
        provisionAttempts: attempts,
        updatedAt: new Date(),
      })
      .where(eq(vpnAccounts.id, existing[0].id));
  }

  try {
    let account: ProviderVpnAccount | null = null;

    const currentProviderId = existing[0]?.providerAccountId;
    if (currentProviderId && isRealProviderId(currentProviderId)) {
      try {
        account = await vpn.getAccount(currentProviderId);
      } catch (err) {
        if (!(err instanceof VpnProviderError) || err.code !== "not_found") {
          throw err;
        }
        account = null;
      }
    }

    if (!account) {
      const byUsername = await vpn.findAccountByUsername(username);
      if (byUsername) {
        account = byUsername;
      }
    }

    if (!account) {
      account = await vpn.createAccount({
        username,
        password,
        externalCustomerId: userId,
        email: user.email,
        firstName: user.name?.split(" ")[0],
        lastName: user.name?.split(" ").slice(1).join(" ") || undefined,
      });
    }

    const localStatus = mapProviderStatusToLocal(account.status);
    const row = {
      id: localId,
      userId,
      provider: "configured",
      providerAccountId: account.providerAccountId,
      username: account.username,
      status: localStatus === "pending" ? ("active" as const) : localStatus,
      lastError: null as string | null,
      provisionAttempts: attempts,
      lastReconciledAt: new Date(),
      updatedAt: new Date(),
    };

    await db.update(vpnAccounts).set(row).where(eq(vpnAccounts.id, localId));

    const lifecycle = nextLifecycleAfterVpnProvisioned(
      user.lifecycle as Parameters<typeof nextLifecycleAfterVpnProvisioned>[0],
    );
    const finalLifecycle = nextLifecycleAfterVpnProvisioned(lifecycle);
    await db.update(users).set({ lifecycle: finalLifecycle, updatedAt: new Date() }).where(eq(users.id, userId));

    await recordProviderEvent(db, {
      action: "account.provision",
      status: "success",
      targetId: localId,
      correlationId,
      metadata: { providerAccountId: account.providerAccountId },
    });

    await writeAudit(db, {
      actorId: "system",
      actorType: "system",
      action: "vpn.provisioned",
      targetType: "vpn_account",
      targetId: localId,
      correlationId,
      metadata: { userId },
    });

    // Delivery problems must never turn a provisioned account into an error state.
    await sendEmailSafe(email, {
      to: user.email,
      template: "vpn_provisioned",
      vars: { name: user.name ?? "there" },
      correlationId,
    });

    return { ...row, createdAt: existing[0]?.createdAt ?? new Date() };
  } catch (err) {
    const diagnostic = formatProviderError(err, "account.provision");
    await db
      .update(vpnAccounts)
      .set({
        status: "error",
        lastError: diagnostic,
        provisionAttempts: attempts,
        updatedAt: new Date(),
      })
      .where(eq(vpnAccounts.id, localId));

    await recordProviderEvent(db, {
      action: "account.provision",
      status: "error",
      targetId: localId,
      correlationId,
      metadata: { diagnostic: JSON.parse(diagnostic) as Record<string, unknown> },
    });
    throw err;
  }
}

function addBillingPeriod(from: Date, planId: string): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + (planId.includes("annual") ? 12 : 1));
  return end;
}

async function recordPaymentAndInvoice(
  db: Db,
  input: {
    userId: string;
    subscriptionId: string;
    provider: "mock" | "stripe";
    providerPaymentId: string;
    amount: number;
  },
) {
  await db.insert(payments).values({
    id: newId("pay"),
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    amount: input.amount,
    currency: "GBP",
    status: "succeeded",
  });
  await db.insert(invoices).values({
    id: newId("inv"),
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    providerInvoiceId: input.providerPaymentId,
    amount: input.amount,
    currency: "GBP",
    status: "paid",
  });
}

async function findLiveSubscription(db: Db, userId: string) {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return rows.find((s) => isLiveSubscriptionStatus(s.status));
}

/**
 * A payment came in for a customer: move their lifecycle forward and, if their VPN account was
 * paused or cut off earlier (lapsed, cancelled, suspended), turn it back on at the provider.
 */
async function restoreAccessAfterPayment(
  db: Db,
  vpn: VPNProvider,
  userId: string,
  lifecycle: CustomerLifecycle,
  correlationId: string,
) {
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  const hasLiveAccount = Boolean(account && isRealProviderId(account.providerAccountId));

  let next = nextLifecycleAfterPayment(lifecycle === "cancelled" ? "customer" : lifecycle);
  if (hasLiveAccount && account!.status === "active" && next === "subscribed") next = "active";
  await db.update(users).set({ lifecycle: next, updatedAt: new Date() }).where(eq(users.id, userId));

  if (hasLiveAccount && (account!.status === "disabled" || account!.status === "expired")) {
    try {
      await reactivateVpnForUser(db, vpn, userId, correlationId, "system");
    } catch {
      // Provider error is recorded on the account; reconciliation retries.
    }
  }
}

/**
 * Close out a subscription (lapsed, cancelled immediately, or ended by the provider):
 * cut VPN access and leave the customer in the right lifecycle state.
 */
export async function endSubscription(
  db: Db,
  vpn: VPNProvider,
  sub: { id: string; userId: string },
  finalStatus: "cancelled" | "expired",
  correlationId: string,
) {
  await db
    .update(subscriptions)
    .set({ status: finalStatus, cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  await suspendVpnForUser(db, vpn, sub.userId, correlationId, "system");
  if (finalStatus === "cancelled") {
    await db.update(users).set({ lifecycle: "cancelled", updatedAt: new Date() }).where(eq(users.id, sub.userId));
  }
  await writeAudit(db, {
    actorType: "system",
    action: `subscription.${finalStatus}`,
    targetType: "subscription",
    targetId: sub.id,
    correlationId,
    metadata: { userId: sub.userId },
  });
}

/**
 * Subscriptions whose paid period (plus the renewal grace window) has passed no longer grant access.
 * Cancelling subscriptions end exactly at period end.
 */
export async function expireLapsedSubscriptions(
  db: Db,
  vpn: VPNProvider,
  correlationId: string,
  now = new Date(),
) {
  const live = await db
    .select()
    .from(subscriptions)
    .where(inArray(subscriptions.status, ["active", "trialing", "cancelling", "past_due"]));
  const graceMs = RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const ended: string[] = [];
  for (const sub of live) {
    if (!sub.currentPeriodEnd) continue;
    const end = sub.currentPeriodEnd.getTime();
    const lapsed = sub.status === "cancelling" ? end <= now.getTime() : end + graceMs <= now.getTime();
    if (!lapsed) continue;
    await endSubscription(db, vpn, sub, sub.status === "cancelling" ? "cancelled" : "expired", correlationId);
    ended.push(sub.userId);
  }
  return ended;
}

async function findSubscriptionByProviderId(db: Db, providerSubscriptionId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1);
  return rows[0] ?? null;
}

/** A renewal charge failed: start (or continue) dunning. Access is cut on the second failure. */
export async function handlePaymentFailed(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  input: { providerSubscriptionId: string },
  correlationId: string,
) {
  const sub = await findSubscriptionByProviderId(db, input.providerSubscriptionId);
  if (!sub || !isLiveSubscriptionStatus(sub.status)) return null;
  const [user] = await db.select().from(users).where(eq(users.id, sub.userId)).limit(1);
  if (!user || user.deletedAt) return null;

  if (sub.status === "active" || sub.status === "trialing") {
    await db
      .update(subscriptions)
      .set({ status: "past_due", updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  }

  const next = nextLifecycleAfterPaymentFailed(user.lifecycle as CustomerLifecycle);
  if (next === "suspended" && user.lifecycle !== "suspended") {
    await suspendVpnForUser(db, vpn, user.id, correlationId, "system");
  } else if (next !== user.lifecycle) {
    await db.update(users).set({ lifecycle: next, updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  await writeAudit(db, {
    actorType: "webhook",
    action: "billing.payment_failed",
    targetType: "subscription",
    targetId: sub.id,
    correlationId,
    metadata: { userId: user.id, lifecycle: next },
  });
  await sendEmailSafe(email, {
    to: user.email,
    template: "payment_failed",
    vars: { name: user.name ?? "there" },
    correlationId,
  });
  return sub;
}

/** A renewal charge succeeded: extend the period, record it, and restore access if it had lapsed. */
export async function handleRenewal(
  db: Db,
  vpn: VPNProvider,
  input: { providerSubscriptionId: string; providerPaymentId: string; amount: number; provider: "mock" | "stripe" },
  correlationId: string,
) {
  const sub = await findSubscriptionByProviderId(db, input.providerSubscriptionId);
  if (!sub) return null;

  const seen = await db
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentId, input.providerPaymentId))
    .limit(1);
  if (seen[0]) return sub;

  const [user] = await db.select().from(users).where(eq(users.id, sub.userId)).limit(1);
  if (!user || user.deletedAt) return null;

  if (!isLiveSubscriptionStatus(sub.status)) {
    // A late payment for a subscription we already ended. Only revive it if nothing else is live.
    const other = await findLiveSubscription(db, sub.userId);
    if (other) {
      await recordPaymentAndInvoice(db, {
        userId: sub.userId,
        subscriptionId: other.id,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        amount: input.amount,
      });
      await writeAudit(db, {
        actorType: "system",
        action: "billing.duplicate_payment",
        targetType: "subscription",
        targetId: other.id,
        correlationId,
        metadata: { userId: sub.userId, endedSubscriptionId: sub.id },
      });
      return other;
    }
  }

  const periodStart = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
  await db
    .update(subscriptions)
    .set({
      status: sub.cancelAtPeriodEnd ? "cancelling" : "active",
      currentPeriodEnd: addBillingPeriod(periodStart, sub.planId),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
  await recordPaymentAndInvoice(db, {
    userId: sub.userId,
    subscriptionId: sub.id,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    amount: input.amount,
  });
  if (!sub.cancelAtPeriodEnd) {
    await restoreAccessAfterPayment(db, vpn, sub.userId, user.lifecycle as CustomerLifecycle, correlationId);
  }
  await writeAudit(db, {
    actorType: "webhook",
    action: "billing.renewed",
    targetType: "subscription",
    targetId: sub.id,
    correlationId,
    metadata: { userId: sub.userId },
  });
  return sub;
}

/** The provider ended the subscription (e.g. Stripe customer.subscription.deleted). */
export async function handleSubscriptionEnded(
  db: Db,
  vpn: VPNProvider,
  input: { providerSubscriptionId: string },
  correlationId: string,
) {
  const sub = await findSubscriptionByProviderId(db, input.providerSubscriptionId);
  if (!sub || !isLiveSubscriptionStatus(sub.status)) return null;
  await endSubscription(db, vpn, sub, "cancelled", correlationId);
  return sub;
}

/** Customer-initiated resume of a subscription that was set to cancel at period end. */
export async function resumeSubscriptionForUser(
  db: Db,
  billing: BillingProvider,
  user: { id: string; lifecycle: string },
  correlationId: string,
) {
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
  const sub = subs.find((s) => s.status === "cancelling");
  if (!sub?.providerSubscriptionId) return null;
  const updated = await billing.resumeSubscription(sub.providerSubscriptionId);
  await db
    .update(subscriptions)
    .set({ status: updated.status, cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  const lifecycle = nextLifecycleAfterResume(user.lifecycle as CustomerLifecycle, account?.status === "active");
  await db.update(users).set({ lifecycle, updatedAt: new Date() }).where(eq(users.id, user.id));
  await writeAudit(db, {
    actorId: user.id,
    actorType: "user",
    action: "subscription.resumed",
    targetType: "subscription",
    targetId: sub.id,
    correlationId,
  });
  return updated;
}

/**
 * Close a customer's account: stop billing first (so they are never charged after deleting),
 * then remove the provider VPN account, revoke local access and anonymise the user record.
 * Payment and invoice rows are kept for accounting.
 */
export async function deleteUserAccount(
  db: Db,
  vpn: VPNProvider,
  billing: BillingProvider,
  user: { id: string },
  correlationId: string,
) {
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
  for (const sub of subs.filter((s) => isLiveSubscriptionStatus(s.status))) {
    if (sub.providerSubscriptionId) {
      try {
        await billing.cancelSubscription(sub.providerSubscriptionId, false);
      } catch (err) {
        // A subscription the provider no longer knows is already gone; anything else must
        // abort the deletion so the customer is not left being billed with no account.
        if (!(err instanceof BillingProviderError && err.code === "not_found")) throw err;
      }
    }
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  }

  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
  if (account) {
    await softRevokeConnectionsForAccount(db, account.id);
    if (isRealProviderId(account.providerAccountId)) {
      await deleteProviderAccount(db, vpn, account, correlationId);
    }
  }

  await db.update(devices).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(devices.userId, user.id));
  await db.delete(verificationTokens).where(eq(verificationTokens.userId, user.id));
  await destroyUserSessions(db, user.id);
  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      email: `deleted+${user.id}@invalid.local`,
      name: null,
      passwordHash: "!deleted",
      lifecycle: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await writeAudit(db, {
    actorId: user.id,
    actorType: "user",
    action: "account.deleted",
    targetType: "user",
    targetId: user.id,
    correlationId,
  });
}

/** Delete the provider account; on failure keep a marker so reconciliation retries it. */
async function deleteProviderAccount(
  db: Db,
  vpn: VPNProvider,
  account: { id: string; providerAccountId: string },
  correlationId: string,
): Promise<boolean> {
  try {
    await vpn.deleteAccount(account.providerAccountId);
  } catch (err) {
    if (!(err instanceof VpnProviderError && err.code === "not_found")) {
      const diagnostic = formatProviderError(err, "account.delete");
      await db
        .update(vpnAccounts)
        .set({ status: "error", lastError: diagnostic, updatedAt: new Date() })
        .where(eq(vpnAccounts.id, account.id));
      await recordProviderEvent(db, {
        action: "account.delete",
        status: "error",
        targetId: account.id,
        correlationId,
        metadata: { diagnostic: JSON.parse(diagnostic) as Record<string, unknown> },
      });
      return false;
    }
  }
  await db
    .update(vpnAccounts)
    .set({ status: "expired", lastError: null, updatedAt: new Date(), lastReconciledAt: new Date() })
    .where(eq(vpnAccounts.id, account.id));
  await recordProviderEvent(db, {
    action: "account.delete",
    status: "success",
    targetId: account.id,
    correlationId,
  });
  return true;
}

/** Retry provider-side deletion for closed accounts whose first attempt failed. */
export async function retryDeletedAccountCleanup(db: Db, vpn: VPNProvider, correlationId: string) {
  const rows = await db
    .select({ account: vpnAccounts })
    .from(vpnAccounts)
    .innerJoin(users, eq(vpnAccounts.userId, users.id))
    .where(and(isNotNull(users.deletedAt), ne(vpnAccounts.status, "expired")));
  const cleaned: string[] = [];
  for (const { account } of rows) {
    if (!isRealProviderId(account.providerAccountId)) continue;
    if (await deleteProviderAccount(db, vpn, account, correlationId)) cleaned.push(account.userId);
  }
  return cleaned;
}

/** Rotate the password used for username/password VPN protocols; returned once to the customer. */
export async function resetVpnCredentials(
  db: Db,
  vpn: VPNProvider,
  userId: string,
  correlationId: string,
): Promise<{ username: string; password: string }> {
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (!account || account.status !== "active" || !isRealProviderId(account.providerAccountId)) {
    throw new Error("VPN account is not active");
  }
  const password = generateVpnPassword();
  await vpn.changePassword(account.providerAccountId, password);
  await recordProviderEvent(db, {
    action: "account.password_reset",
    status: "success",
    targetId: account.id,
    correlationId,
  });
  await writeAudit(db, {
    actorId: userId,
    actorType: "user",
    action: "vpn.credentials_reset",
    targetType: "vpn_account",
    targetId: account.id,
    correlationId,
  });
  return { username: account.username, password };
}

/**
 * After a verified payment: create the subscription + payment record and provision VPN.
 * Idempotent per provider subscription id, and a user can only ever hold one live subscription
 * (enforced by a partial unique index); extra payments are recorded and flagged for refund.
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
  if (!user || user.deletedAt) throw new Error("User not found");

  const live = await findLiveSubscription(db, input.userId);
  if (live) {
    if (live.providerSubscriptionId !== input.providerSubscriptionId) {
      // The customer was charged for a second subscription. Keep their single live one,
      // but leave an auditable trail so support can refund it.
      await recordPaymentAndInvoice(db, {
        userId: input.userId,
        subscriptionId: live.id,
        provider: input.provider,
        providerPaymentId: input.providerSubscriptionId,
        amount: input.amount,
      });
      await writeAudit(db, {
        actorType: "system",
        action: "billing.duplicate_payment",
        targetType: "subscription",
        targetId: live.id,
        correlationId: input.correlationId,
        metadata: { userId: input.userId, extraProviderSubscriptionId: input.providerSubscriptionId },
      });
    }
    try {
      await provisionVpnForUser(db, vpn, email, input.userId, input.correlationId);
    } catch {
      // Left in error/pending for reconciliation.
    }
    return live;
  }

  const subId = newId("sub");
  try {
    await db.insert(subscriptions).values({
      id: subId,
      userId: input.userId,
      planId: input.planId,
      status: "active",
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      currentPeriodEnd: addBillingPeriod(new Date(), input.planId),
      cancelAtPeriodEnd: false,
    });
  } catch (err) {
    // Lost a race with a concurrent delivery for the same user: the winner's subscription stands.
    const winner = await findLiveSubscription(db, input.userId);
    if (winner) return winner;
    throw err;
  }

  await recordPaymentAndInvoice(db, {
    userId: input.userId,
    subscriptionId: subId,
    provider: input.provider,
    providerPaymentId: input.providerSubscriptionId,
    amount: input.amount,
  });

  await restoreAccessAfterPayment(db, vpn, input.userId, user.lifecycle as CustomerLifecycle, input.correlationId);

  await writeAudit(db, {
    actorId: input.userId,
    actorType: "user",
    action: "subscription.created",
    targetType: "subscription",
    targetId: subId,
    correlationId: input.correlationId,
  });

  await sendEmailSafe(email, {
    to: user.email,
    template: "subscription_started",
    vars: { name: user.name ?? "there", planName: input.planId },
    correlationId: input.correlationId,
  });

  try {
    await provisionVpnForUser(db, vpn, email, input.userId, input.correlationId);
  } catch {
    // Subscription is active; VPN is left in error/pending for reconciliation. The customer
    // lifecycle deliberately stays "subscribed" until provisioning actually succeeds.
  }

  return (await db.select().from(subscriptions).where(eq(subscriptions.id, subId)))[0]!;
}

export async function syncLocationsFromProvider(db: Db, vpn: VPNProvider, preferLive: boolean) {
  const remote = await vpn.listLocations();
  const existing = await db.select().from(vpnLocations);
  const byProviderId = new Map(existing.map((l) => [l.providerId, l]));
  let upserted = 0;

  for (const loc of remote) {
    const found = byProviderId.get(loc.providerId);
    if (found) {
      await db
        .update(vpnLocations)
        .set({
          country: loc.country,
          countryCode: loc.countryCode,
          city: loc.city,
          region: loc.region ?? null,
          hostname: loc.hostname,
          status: loc.status,
          protocolSupportJson: JSON.stringify(loc.protocolSupport),
          latency: loc.latency ?? null,
          load: loc.load ?? null,
          isFixture: preferLive ? false : found.isFixture,
          updatedAt: new Date(),
        })
        .where(eq(vpnLocations.id, found.id));
    } else {
      await db.insert(vpnLocations).values({
        id: newId("loc"),
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
        isFixture: !preferLive,
      });
    }
    upserted += 1;
  }

  if (preferLive && remote.length > 0) {
    const liveIds = new Set(remote.map((l) => l.providerId));
    for (const loc of existing) {
      if (loc.isFixture && !liveIds.has(loc.providerId)) {
        await db
          .update(vpnLocations)
          .set({ status: "offline", updatedAt: new Date() })
          .where(eq(vpnLocations.id, loc.id));
      }
    }
  }

  return { upserted, total: remote.length };
}

async function softRevokeConnectionsForAccount(db: Db, vpnAccountId: string) {
  const conns = await db
    .select()
    .from(vpnConnections)
    .where(and(eq(vpnConnections.vpnAccountId, vpnAccountId), isNull(vpnConnections.revokedAt)));
  const now = new Date();
  for (const conn of conns) {
    await db
      .update(vpnConnections)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(vpnConnections.id, conn.id));
  }
  return conns.length;
}

/** Sync a single local VPN account with the provider. */
export async function syncVpnAccountWithProvider(
  db: Db,
  vpn: VPNProvider,
  userId: string,
  correlationId: string,
) {
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (!account || !isRealProviderId(account.providerAccountId)) {
    return { synced: false as const, reason: "no_provider_account" };
  }

  try {
    const remote = await vpn.getAccount(account.providerAccountId);
    const localStatus = mapProviderStatusToLocal(remote.status);
    const prev = account.status;
    await db
      .update(vpnAccounts)
      .set({
        status: localStatus,
        username: remote.username,
        lastError: null,
        lastReconciledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(vpnAccounts.id, account.id));

    if (localStatus === "disabled" || localStatus === "expired") {
      await softRevokeConnectionsForAccount(db, account.id);
    }

    await recordProviderEvent(db, {
      action: "account.sync",
      status: "success",
      targetId: account.id,
      correlationId,
      metadata: { from: prev, to: localStatus },
    });

    return { synced: true as const, from: prev, to: localStatus };
  } catch (err) {
    const diagnostic = formatProviderError(err, "account.sync");
    await db
      .update(vpnAccounts)
      .set({ lastError: diagnostic, lastReconciledAt: new Date(), updatedAt: new Date() })
      .where(eq(vpnAccounts.id, account.id));
    await recordProviderEvent(db, {
      action: "account.sync",
      status: "error",
      targetId: account.id,
      correlationId,
      metadata: { diagnostic: JSON.parse(diagnostic) as Record<string, unknown> },
    });
    return { synced: false as const, reason: "provider_error", diagnostic };
  }
}

/**
 * Find users with paid subscription but missing/failed VPN and retry.
 * Also syncs provider status for existing accounts.
 */
export async function reconcileVpnProvisioning(
  db: Db,
  vpn: VPNProvider,
  email: EmailProvider,
  correlationId: string,
  options?: { syncLocations?: boolean; preferLiveLocations?: boolean; userId?: string },
) {
  const repaired: string[] = [];
  const synced: string[] = [];
  const failed: Array<{ userId: string; error: string }> = [];

  if (options?.syncLocations) {
    try {
      await syncLocationsFromProvider(db, vpn, Boolean(options.preferLiveLocations));
    } catch (err) {
      failed.push({
        userId: "system",
        error: formatProviderError(err, "syncLocations"),
      });
    }
  }

  // End lapsed subscriptions first so they are not "repaired" back into service below.
  let expired: string[] = [];
  try {
    expired = await expireLapsedSubscriptions(db, vpn, correlationId);
  } catch (err) {
    failed.push({ userId: "system", error: formatProviderError(err, "expireLapsedSubscriptions") });
  }

  let cleaned: string[] = [];
  try {
    cleaned = await retryDeletedAccountCleanup(db, vpn, correlationId);
  } catch (err) {
    failed.push({ userId: "system", error: formatProviderError(err, "retryDeletedAccountCleanup") });
  }

  const allSubs = options?.userId
    ? await db.select().from(subscriptions).where(eq(subscriptions.userId, options.userId))
    : await db.select().from(subscriptions);

  const deletedRows = await db.select({ id: users.id }).from(users).where(isNotNull(users.deletedAt));
  const deletedIds = new Set(deletedRows.map((u) => u.id));

  // Anyone still holding a live subscription (including one that is cancelling or in dunning) is
  // entitled to a working VPN; ones that lapsed were ended above.
  const entitledUserIds = new Set(
    allSubs
      .filter((s) => isLiveSubscriptionStatus(s.status) && !deletedIds.has(s.userId))
      .map((s) => s.userId),
  );

  const accounts = options?.userId
    ? await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, options.userId))
    : await db.select().from(vpnAccounts);
  const byUser = new Map(accounts.map((a) => [a.userId, a]));

  for (const userId of entitledUserIds) {
    const account = byUser.get(userId);
    if (!account || account.status === "error" || account.status === "pending") {
      try {
        await provisionVpnForUser(db, vpn, email, userId, correlationId);
        repaired.push(userId);
      } catch (err) {
        failed.push({ userId, error: formatProviderError(err, "reconcile.provision") });
      }
      continue;
    }

    if (isRealProviderId(account.providerAccountId)) {
      const result = await syncVpnAccountWithProvider(db, vpn, userId, correlationId);
      if (result.synced) synced.push(userId);
      else if (result.reason === "provider_error") {
        failed.push({ userId, error: result.diagnostic ?? "sync failed" });
      }
    }
  }

  // Also sync disabled accounts that still have real provider ids (observability)
  for (const account of accounts) {
    if (
      entitledUserIds.has(account.userId) ||
      deletedIds.has(account.userId) ||
      !isRealProviderId(account.providerAccountId) ||
      account.status === "pending" ||
      account.status === "error"
    ) {
      continue;
    }
    const result = await syncVpnAccountWithProvider(db, vpn, account.userId, correlationId);
    if (result.synced && !synced.includes(account.userId)) synced.push(account.userId);
  }

  await purgeExpiredSessions(db);

  return { repaired, synced, failed, expired, cleaned };
}

export async function suspendVpnForUser(
  db: Db,
  vpn: VPNProvider,
  userId: string,
  correlationId: string,
  actorId: string,
) {
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (account && isRealProviderId(account.providerAccountId)) {
    try {
      await vpn.suspendAccount(account.providerAccountId);
      await recordProviderEvent(db, {
        action: "account.suspend",
        status: "success",
        targetId: account.id,
        correlationId,
      });
    } catch (err) {
      await recordProviderEvent(db, {
        action: "account.suspend",
        status: "error",
        targetId: account.id,
        correlationId,
        metadata: { diagnostic: JSON.parse(formatProviderError(err, "account.suspend")) },
      });
      // still mark locally
    }
    await db
      .update(vpnAccounts)
      .set({ status: "disabled", updatedAt: new Date(), lastReconciledAt: new Date() })
      .where(eq(vpnAccounts.id, account.id));
    await softRevokeConnectionsForAccount(db, account.id);
  }
  await db.update(users).set({ lifecycle: "suspended", updatedAt: new Date() }).where(eq(users.id, userId));
  await writeAudit(db, {
    actorId,
    actorType: actorId === "system" ? "system" : "admin",
    action: "account.suspended",
    targetType: "user",
    targetId: userId,
    correlationId,
  });
}

export async function reactivateVpnForUser(
  db: Db,
  vpn: VPNProvider,
  userId: string,
  correlationId: string,
  actorId: string,
) {
  const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (account && isRealProviderId(account.providerAccountId)) {
    try {
      await vpn.reactivateAccount(account.providerAccountId);
      await db
        .update(vpnAccounts)
        .set({ status: "active", lastError: null, updatedAt: new Date(), lastReconciledAt: new Date() })
        .where(eq(vpnAccounts.id, account.id));
      await recordProviderEvent(db, {
        action: "account.reactivate",
        status: "success",
        targetId: account.id,
        correlationId,
      });
    } catch (err) {
      const diagnostic = formatProviderError(err, "account.reactivate");
      await db
        .update(vpnAccounts)
        .set({ lastError: diagnostic, updatedAt: new Date() })
        .where(eq(vpnAccounts.id, account.id));
      throw err;
    }
  }
  await db.update(users).set({ lifecycle: "active", updatedAt: new Date() }).where(eq(users.id, userId));
  await writeAudit(db, {
    actorId,
    actorType: actorId === "system" ? "system" : "admin",
    action: "account.restored",
    targetType: "user",
    targetId: userId,
    correlationId,
  });
}

export const MAX_CONNECTIONS_PER_USER = 25;

/** Device allowance from the customer's live plan (a lapsed customer falls back to the default). */
export async function getDeviceLimit(db: Db, userId: string): Promise<number> {
  const live = await findLiveSubscription(db, userId);
  if (!live) return 5;
  const [plan] = await db.select().from(plans).where(eq(plans.id, live.planId)).limit(1);
  return plan?.maxDevices ?? 5;
}

/** Throws when the customer already has as many active devices as their plan allows. */
export async function assertDeviceCapacity(db: Db, userId: string): Promise<void> {
  const limit = await getDeviceLimit(db, userId);
  const current = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
  if (current.length >= limit) throw new HttpError(400, `Device limit reached (${limit})`);
}
