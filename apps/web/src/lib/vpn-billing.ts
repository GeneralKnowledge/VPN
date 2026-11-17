import { and, eq, inArray } from "drizzle-orm";
import {
  BillingProviderError,
  StripeBillingProvider,
  idOf,
  isLiveSubscriptionStatus,
  isStripeSubscriptionId,
  parseStripeSubscription,
  type BillingProvider,
  type OneTimePayments,
} from "@northstar/billing";
import { getPlan } from "@northstar/config";
import { checkoutSessions, payments, subscriptions, type Db } from "@northstar/db";
import type { EmailProvider } from "@northstar/email";
import type { VPNProvider } from "@northstar/vpn-provider";
import { writeAudit } from "./auth";
import {
  activateSubscription,
  endSubscription,
  findSubscriptionByProviderId,
  syncProviderExpiry,
} from "./services";

/**
 * Stripe side of the VPN plans. Everything here runs from the signed Stripe webhook, after the
 * event has been claimed once (see the webhook route), so each function only has to be safe to
 * re-run after a crash, not against concurrent duplicates.
 */

type StripeSession = Record<string, unknown> & {
  id?: string;
  mode?: string;
  metadata?: Record<string, unknown> | null;
};

export type VpnCheckoutOutcome =
  | "activated"
  | "awaiting_payment"
  | "duplicate_refunded"
  | "unknown_checkout"
  | "mismatch";

/**
 * `checkout.session.completed` / `checkout.session.async_payment_succeeded` for a VPN plan.
 * Access starts only when Stripe reports the session as paid and it matches a checkout we started.
 */
export async function confirmVpnCheckout(
  db: Db,
  deps: { vpn: VPNProvider; email: EmailProvider; billing: BillingProvider; oneTime: OneTimePayments },
  session: StripeSession,
  correlationId: string,
): Promise<VpnCheckoutOutcome> {
  const sessionId = String(session.id ?? "");
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const userId = typeof metadata.userId === "string" ? metadata.userId : null;
  const planId = typeof metadata.planId === "string" ? metadata.planId : null;

  const [checkout] = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.providerSessionId, sessionId))
    .limit(1);
  const plan = planId ? getPlan(planId) : undefined;
  if (!checkout || !userId || !plan) {
    // Not a checkout this site started (or its row was lost). Leave a trail and grant nothing.
    await writeAudit(db, {
      actorType: "webhook",
      action: "billing.checkout_unknown",
      targetType: "checkout_session",
      targetId: sessionId,
      correlationId,
      metadata: { userId, planId },
    });
    return "unknown_checkout";
  }
  if (checkout.userId !== userId || getPlan(checkout.planId)?.id !== plan.id) {
    await writeAudit(db, {
      actorType: "webhook",
      action: "billing.checkout_mismatch",
      targetType: "checkout_session",
      targetId: sessionId,
      correlationId,
      metadata: { userId, planId, expectedUserId: checkout.userId, expectedPlanId: checkout.planId },
    });
    return "mismatch";
  }

  // Bank debits and similar complete the session before the money arrives; wait for
  // checkout.session.async_payment_succeeded in that case.
  if (session.payment_status !== "paid") return "awaiting_payment";

  const subscriptionMode = session.mode === "subscription";
  const stripeSubscriptionId = idOf(session.subscription);
  if (subscriptionMode && !stripeSubscriptionId) {
    throw new Error("Paid subscription checkout has no subscription id");
  }
  const providerSubscriptionId = stripeSubscriptionId ?? sessionId;
  const invoiceId = idOf(session.invoice);
  const paymentIntentId = idOf(session.payment_intent);
  // Renewals are keyed by invoice id, so keying the first payment the same way keeps the
  // subscription_create invoice from ever being counted twice.
  const providerPaymentId = invoiceId ?? paymentIntentId ?? sessionId;
  const amount = typeof session.amount_total === "number" ? session.amount_total : plan.price;
  const currency = typeof session.currency === "string" ? session.currency.toUpperCase() : null;

  if (amount !== plan.price || (currency && currency !== "GBP")) {
    // The Stripe price disagrees with the catalogue: the customer paid what Stripe showed them,
    // so they get access, but the configuration needs fixing.
    await writeAudit(db, {
      actorType: "webhook",
      action: "billing.amount_mismatch",
      targetType: "checkout_session",
      targetId: sessionId,
      correlationId,
      metadata: { planId: plan.id, expected: plan.price, paid: amount, currency },
    });
  }

  await db
    .update(checkoutSessions)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(checkoutSessions.id, checkout.id));

  const live = await activateSubscription(db, deps.vpn, deps.email, {
    userId,
    planId: plan.id,
    providerSubscriptionId,
    providerPaymentId,
    provider: "stripe",
    amount,
    correlationId,
    billingMode: plan.billingMode,
  });

  if (live.providerSubscriptionId === providerSubscriptionId) return "activated";

  // The customer already had a live plan (two tabs, or a second purchase): keep the first one,
  // stop the second from renewing and give the money back.
  await refundDuplicateCheckout(db, deps, {
    sessionId,
    stripeSubscriptionId,
    invoiceId,
    paymentIntentId,
    providerPaymentId,
    userId,
    correlationId,
  });
  return "duplicate_refunded";
}

async function refundDuplicateCheckout(
  db: Db,
  deps: { billing: BillingProvider; oneTime: OneTimePayments },
  input: {
    sessionId: string;
    stripeSubscriptionId: string | null;
    invoiceId: string | null;
    paymentIntentId: string | null;
    providerPaymentId: string;
    userId: string;
    correlationId: string;
  },
) {
  // Mark first, so the charge.refunded event that follows is not read as a refund of the live plan.
  await db
    .update(payments)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(and(eq(payments.provider, "stripe"), eq(payments.providerPaymentId, input.providerPaymentId)));

  if (input.stripeSubscriptionId) {
    try {
      await deps.billing.cancelSubscription(input.stripeSubscriptionId, false);
    } catch (err) {
      // Already cancelled on an earlier attempt.
      if (!(err instanceof BillingProviderError && (err.code === "not_found" || err.code === "validation"))) throw err;
    }
  }

  let pi = input.paymentIntentId;
  if (!pi && input.invoiceId && deps.billing instanceof StripeBillingProvider) {
    pi = await deps.billing.paymentIntentForInvoice(input.invoiceId);
  }
  if (!pi) throw new Error("Cannot refund duplicate checkout: no payment intent found");
  // The idempotency key makes a retried webhook reuse the same refund.
  const refund = await deps.oneTime.refund(pi, `vpn_dup_refund_${input.sessionId}`);
  await writeAudit(db, {
    actorType: "system",
    action: "billing.duplicate_refunded",
    targetType: "checkout_session",
    targetId: input.sessionId,
    correlationId: input.correlationId,
    metadata: { userId: input.userId, refundId: refund.id, refundStatus: refund.status },
  });
}

/** `checkout.session.expired` / `async_payment_failed` for a VPN plan: the checkout can't be paid any more. */
export async function expireVpnCheckout(db: Db, sessionId: string) {
  await db
    .update(checkoutSessions)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(checkoutSessions.providerSessionId, sessionId), eq(checkoutSessions.status, "open")));
}

/**
 * `customer.subscription.updated`: follow cancel / resume changes made outside this site
 * (Stripe dashboard, a support agent). Payment state changes arrive as invoice events instead.
 */
export async function syncStripeSubscription(
  db: Db,
  vpn: VPNProvider,
  object: Record<string, unknown>,
  correlationId: string,
) {
  const remote = parseStripeSubscription(object);
  if (!isStripeSubscriptionId(remote.id)) return null;
  const sub = await findSubscriptionByProviderId(db, remote.id);
  if (!sub || !isLiveSubscriptionStatus(sub.status)) return null;

  let status = sub.status;
  if (remote.cancelAtPeriodEnd && sub.status !== "cancelling") status = "cancelling";
  else if (!remote.cancelAtPeriodEnd && sub.status === "cancelling") status = "active";
  if (status === sub.status && remote.cancelAtPeriodEnd === sub.cancelAtPeriodEnd) return sub;

  await db
    .update(subscriptions)
    .set({ status, cancelAtPeriodEnd: remote.cancelAtPeriodEnd, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));
  await syncProviderExpiry(db, vpn, sub.userId, correlationId);
  await writeAudit(db, {
    actorType: "webhook",
    action: "subscription.synced",
    targetType: "subscription",
    targetId: sub.id,
    correlationId,
    metadata: { cancelAtPeriodEnd: remote.cancelAtPeriodEnd, status },
  });
  return sub;
}

/**
 * `charge.refunded` for a VPN payment (refunded from the Stripe dashboard, for example).
 * A full refund of a plan's payment ends that plan's access and stops it renewing; a partial
 * refund is only recorded. Returns false when the charge isn't a VPN payment.
 */
export async function recordVpnRefundFromStripe(
  db: Db,
  deps: { vpn: VPNProvider; billing: BillingProvider },
  charge: Record<string, unknown>,
  correlationId: string,
): Promise<boolean> {
  const pi = idOf(charge.payment_intent);
  let invoiceId = idOf(charge.invoice);
  if (!invoiceId && pi && deps.billing instanceof StripeBillingProvider) {
    invoiceId = await deps.billing.invoiceForPaymentIntent(pi);
  }
  const keys = [pi, invoiceId].filter((k): k is string => Boolean(k));
  if (keys.length === 0) return false;

  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.provider, "stripe"), eq(payments.product, "vpn"), inArray(payments.providerPaymentId, keys)),
    )
    .limit(1);
  if (!payment) return false;
  if (payment.status === "refunded") return true;

  const full = charge.refunded === true;
  if (!full) {
    await writeAudit(db, {
      actorType: "webhook",
      action: "billing.partial_refund",
      targetType: "payment",
      targetId: payment.id,
      correlationId,
      metadata: { userId: payment.userId, amountRefunded: Number(charge.amount_refunded ?? 0) },
    });
    return true;
  }

  await db.update(payments).set({ status: "refunded", updatedAt: new Date() }).where(eq(payments.id, payment.id));
  await writeAudit(db, {
    actorType: "webhook",
    action: "billing.refunded",
    targetType: "payment",
    targetId: payment.id,
    correlationId,
    metadata: { userId: payment.userId },
  });

  if (!payment.subscriptionId) return true;
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, payment.subscriptionId)).limit(1);
  if (!sub || !isLiveSubscriptionStatus(sub.status)) return true;
  if (sub.providerSubscriptionId && isStripeSubscriptionId(sub.providerSubscriptionId)) {
    try {
      await deps.billing.cancelSubscription(sub.providerSubscriptionId, false);
    } catch (err) {
      if (!(err instanceof BillingProviderError && (err.code === "not_found" || err.code === "validation"))) throw err;
    }
  }
  await endSubscription(db, deps.vpn, sub, "cancelled", correlationId);
  return true;
}
