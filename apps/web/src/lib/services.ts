import {
  canProvisionVpn,
  nextLifecycleAfterPayment,
  nextLifecycleAfterVpnProvisioned,
  type CustomerLifecycle,
  type SubscriptionStatus,
} from "@northstar/billing";
import {
  providerEvents,
  payments,
  subscriptions,
  users,
  vpnAccounts,
  vpnConnections,
  vpnLocations,
  type Db,
} from "@northstar/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  VpnProviderError,
  type VPNProvider,
  type VpnAccount as ProviderVpnAccount,
} from "@northstar/vpn-provider";
import type { EmailProvider } from "@northstar/email";
import { writeAudit } from "./auth";
import { newId } from "./utils";

function stableUsername(userId: string): string {
  return `ns_${userId.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}`;
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
) {
  const existing = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, userId)).limit(1);
  if (existing[0]?.status === "active" && isRealProviderId(existing[0].providerAccountId)) {
    return existing[0];
  }

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  const billingSub = subs.find((s) => s.status === "active" || s.status === "trialing");
  if (
    billingSub &&
    !canProvisionVpn(user.lifecycle as CustomerLifecycle, billingSub.status as SubscriptionStatus)
  ) {
    throw new Error("VPN provisioning not allowed for current subscription state");
  }

  const username = existing[0]?.username || stableUsername(userId);
  const password = `Tmp_${newId("pwd").slice(0, 12)}`;
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

    await email.send({
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

  try {
    await provisionVpnForUser(db, vpn, email, input.userId, input.correlationId);
  } catch {
    // Subscription is active; VPN left in error/pending for reconciliation
  }

  await db
    .update(users)
    .set({ lifecycle: "active", updatedAt: new Date() })
    .where(eq(users.id, input.userId));

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

  const allSubs = options?.userId
    ? await db.select().from(subscriptions).where(eq(subscriptions.userId, options.userId))
    : await db.select().from(subscriptions);

  const activeUserIds = new Set(
    allSubs.filter((s) => s.status === "active" || s.status === "trialing").map((s) => s.userId),
  );

  const accounts = options?.userId
    ? await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, options.userId))
    : await db.select().from(vpnAccounts);
  const byUser = new Map(accounts.map((a) => [a.userId, a]));

  for (const userId of activeUserIds) {
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
      activeUserIds.has(account.userId) ||
      !isRealProviderId(account.providerAccountId) ||
      account.status === "pending" ||
      account.status === "error"
    ) {
      continue;
    }
    if (options?.userId && account.userId !== options.userId) continue;
    const result = await syncVpnAccountWithProvider(db, vpn, account.userId, correlationId);
    if (result.synced && !synced.includes(account.userId)) synced.push(account.userId);
  }

  return { repaired, synced, failed };
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
