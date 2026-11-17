import { BillingProviderError, type OneTimePayments } from "@northstar/billing";
import { esimOrders, esimProfiles, payments, providerEvents, users, type Db } from "@northstar/db";
import type { EmailProvider } from "@northstar/email";
import {
  CUSTOMER_ESIM_ISSUE_ERROR,
  EsimProviderError,
  classifyIssueError,
  type EsimProvider,
} from "@northstar/esim-provider";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { writeAudit } from "./auth";
import { HttpError } from "./http";
import { sendEmailSafe } from "./notify";
import { newId } from "./utils";

/** Automatic issue retries for orders the provider refused (wallet empty, rate limit) before refunding. */
export const MAX_ESIM_ISSUE_ATTEMPTS = 5;
/** An "issuing" row older than this belongs to a process that died mid-call. */
export const STALE_ISSUING_MS = 10 * 60_000;
/** Pending Stripe checkouts older than this are checked against Stripe (covers missed webhooks). */
export const PENDING_CHECK_AFTER_MS = 15 * 60_000;
const REFUNDABLE_STATUSES = ["refund_due", "failed", "needs_review", "paid"] as const;

export async function createEsimCheckoutOrder(
  db: Db,
  esim: EsimProvider,
  input: {
    userId: string;
    packageCode: string;
    billingProvider: "mock" | "stripe";
    esimProviderKind: string;
    correlationId: string;
    /** Creates the hosted payment page. Omitted: mock checkout id only (tests, mock flow). */
    payments?: OneTimePayments;
    successUrl?: string;
    cancelUrl?: string;
  },
) {
  const pkg = await esim.getPackage(input.packageCode);
  if (!pkg) throw new HttpError(404, "Package not found");

  const userRows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const user = userRows[0];
  if (!user || user.deletedAt) throw new HttpError(404, "User not found");

  const orderId = newId("eso");
  const checkoutId = `esim_chk_${orderId}`;
  const idempotencyKey = `esim_${input.userId}_${input.packageCode}_${orderId}`;

  await db.insert(esimOrders).values({
    id: orderId,
    userId: input.userId,
    packageCode: pkg.code,
    packageName: pkg.name,
    countryCode: pkg.countryCode,
    dataVolume: pkg.dataVolume,
    validity: pkg.validity,
    amount: pkg.price,
    currency: pkg.currency,
    status: "pending",
    billingProvider: input.billingProvider,
    providerCheckoutId: checkoutId,
    esimProvider: input.esimProviderKind,
    idempotencyKey,
  });

  await writeAudit(db, {
    actorId: input.userId,
    actorType: "user",
    action: "esim.checkout.started",
    targetType: "esim_order",
    targetId: orderId,
    correlationId: input.correlationId,
    metadata: { packageCode: pkg.code, amount: pkg.price },
  });

  let sessionId = checkoutId;
  let url = `/billing/mock-esim-checkout?session_id=${encodeURIComponent(checkoutId)}`;
  if (input.payments) {
    try {
      // The price comes from the provider package on the server; the browser only names a package.
      const session = await input.payments.createOneTimeCheckout({
        orderId,
        amount: pkg.price,
        currency: pkg.currency,
        productName: `${pkg.name} eSIM`,
        customerEmail: user.email,
        successUrl: input.successUrl ?? "/dashboard/esim",
        cancelUrl: input.cancelUrl ?? "/pricing",
        idempotencyKey,
        kind: "esim",
      });
      sessionId = session.id;
      url = session.url;
      await db
        .update(esimOrders)
        .set({ providerCheckoutId: sessionId, updatedAt: new Date() })
        .where(eq(esimOrders.id, orderId));
    } catch (err) {
      await db
        .update(esimOrders)
        .set({
          status: "expired",
          lastError: `Checkout could not start: ${err instanceof Error ? err.message : "error"}`.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(esimOrders.id, orderId));
      if (err instanceof BillingProviderError && err.code === "unauthorized") {
        throw new HttpError(503, "eSIM orders are not open yet.");
      }
      throw new HttpError(502, "We couldn’t start checkout. Please try again.");
    }
  }

  return {
    orderId,
    checkoutId: sessionId,
    url,
    package: pkg,
    amount: pkg.price,
    currency: pkg.currency,
  };
}

/**
 * Called from the signed Stripe webhook (checkout.session.completed or
 * async_payment_succeeded). Records the payment once and then issues. Never trusts the browser:
 * the order, amount and currency must match what we created.
 */
export async function confirmEsimPayment(
  db: Db,
  esim: EsimProvider,
  email: EmailProvider,
  pay: OneTimePayments,
  input: {
    checkoutSessionId: string;
    paymentStatus: string;
    paymentIntentId: string | null;
    amountTotal: number | null;
    currency: string | null;
    correlationId: string;
  },
): Promise<{ status: string; orderId: string } | null> {
  const [order] = await db
    .select()
    .from(esimOrders)
    .where(eq(esimOrders.providerCheckoutId, input.checkoutSessionId))
    .limit(1);
  if (!order) return null;
  if (input.paymentStatus !== "paid") {
    // Delayed payment methods: wait for checkout.session.async_payment_succeeded.
    return { status: order.status, orderId: order.id };
  }
  if (order.status !== "pending" && order.status !== "expired") {
    return { status: order.status, orderId: order.id };
  }
  const paymentId = input.paymentIntentId ?? input.checkoutSessionId;
  const amountOk =
    input.amountTotal === order.amount && (input.currency ?? "").toLowerCase() === order.currency.toLowerCase();

  const claimed = await db
    .update(esimOrders)
    .set({
      status: amountOk ? "paid" : "needs_review",
      providerPaymentId: paymentId,
      lastError: amountOk
        ? null
        : `Paid ${input.amountTotal ?? "?"} ${input.currency ?? "?"}, expected ${order.amount} ${order.currency}`,
      updatedAt: new Date(),
    })
    .where(and(eq(esimOrders.id, order.id), inArray(esimOrders.status, ["pending", "expired"])))
    .returning({ id: esimOrders.id });
  if (claimed.length === 0) {
    const [again] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
    return { status: again?.status ?? order.status, orderId: order.id };
  }

  await db
    .insert(payments)
    .values({
      id: newId("pay"),
      userId: order.userId,
      provider: "stripe",
      providerPaymentId: paymentId,
      amount: input.amountTotal ?? order.amount,
      currency: (input.currency ?? order.currency).toUpperCase(),
      status: "succeeded",
    })
    .onConflictDoNothing();

  await writeAudit(db, {
    actorId: order.userId,
    actorType: "system",
    action: amountOk ? "esim.payment.confirmed" : "esim.payment.mismatch",
    targetType: "esim_order",
    targetId: order.id,
    correlationId: input.correlationId,
  });

  if (!amountOk) return { status: "needs_review", orderId: order.id };

  try {
    const result = await issueEsimForOrder(db, esim, email, order.id, input.correlationId, pay);
    return { status: result.order.status, orderId: order.id };
  } catch {
    // The payment is recorded; the order now says what happens next (retry, review or refund).
    const [after] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
    return { status: after?.status ?? "failed", orderId: order.id };
  }
}

/** checkout.session.expired: the customer never paid. */
export async function expireEsimCheckout(db: Db, checkoutSessionId: string) {
  await db
    .update(esimOrders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(esimOrders.providerCheckoutId, checkoutSessionId), eq(esimOrders.status, "pending")));
}

/**
 * Refunds the customer in full. Safe to call repeatedly: the refund uses a fixed idempotency key
 * per order, and an order that is already refunded is left alone.
 */
export async function refundEsimOrder(
  db: Db,
  pay: OneTimePayments,
  email: EmailProvider,
  orderId: string,
  correlationId: string,
  reason: string,
) {
  const [order] = await db.select().from(esimOrders).where(eq(esimOrders.id, orderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status === "refunded") return order;
  if (!(REFUNDABLE_STATUSES as readonly string[]).includes(order.status)) {
    throw new HttpError(400, `Order in status ${order.status} cannot be refunded`);
  }
  if (!order.providerPaymentId) throw new HttpError(400, "Order has no recorded payment");

  // Conditional move so a refund cannot race an issue attempt that has already claimed the order.
  const claimed = await db
    .update(esimOrders)
    .set({ status: "refund_due", lastError: reason.slice(0, 500), updatedAt: new Date() })
    .where(and(eq(esimOrders.id, order.id), inArray(esimOrders.status, [...REFUNDABLE_STATUSES])))
    .returning({ id: esimOrders.id });
  if (claimed.length === 0) throw new HttpError(409, "Order changed; reload and try again");

  try {
    await pay.refund(order.providerPaymentId, `refund_${order.id}`);
  } catch (err) {
    await db
      .update(esimOrders)
      .set({
        lastError: `${reason}; refund failed: ${err instanceof Error ? err.message : "error"}`.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(esimOrders.id, order.id));
    throw new HttpError(502, "Refund failed; it will be retried.");
  }

  await markEsimOrderRefunded(db, order.id, correlationId);
  const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
  if (user?.email) {
    await sendEmailSafe(email, {
      to: user.email,
      template: "esim_refunded",
      vars: {
        name: user.name ?? "there",
        packageName: order.packageName,
        link: "/dashboard/esim",
        actionUrl: "/dashboard/esim",
      },
      correlationId,
    });
  }
  const [updated] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
  return updated!;
}

async function markEsimOrderRefunded(db: Db, orderId: string, correlationId: string) {
  const [order] = await db.select().from(esimOrders).where(eq(esimOrders.id, orderId)).limit(1);
  if (!order || order.status === "refunded") return;
  await db.update(esimOrders).set({ status: "refunded", updatedAt: new Date() }).where(eq(esimOrders.id, orderId));
  if (order.providerPaymentId) {
    await db
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(payments.providerPaymentId, order.providerPaymentId));
  }
  await writeAudit(db, {
    actorId: order.userId,
    actorType: "system",
    action: "esim.refunded",
    targetType: "esim_order",
    targetId: orderId,
    correlationId,
    metadata: { wasIssued: order.status === "issued" },
  });
}

/**
 * charge.refunded from Stripe (including refunds made by hand in the Stripe dashboard). A refund
 * of an eSIM that was already issued is recorded but the eSIM itself is not revoked here.
 */
export async function recordEsimRefundFromStripe(db: Db, paymentIntentId: string, correlationId: string) {
  const [order] = await db
    .select()
    .from(esimOrders)
    .where(eq(esimOrders.providerPaymentId, paymentIntentId))
    .limit(1);
  if (!order) return null;
  await markEsimOrderRefunded(db, order.id, correlationId);
  return order.id;
}

/** Mark paid and issue eSIM profile. Idempotent for already-issued orders. */
export async function completeEsimOrder(
  db: Db,
  esim: EsimProvider,
  email: EmailProvider,
  input: {
    checkoutId: string;
    userId: string;
    providerPaymentId?: string;
    correlationId: string;
  },
) {
  const [order] = await db
    .select()
    .from(esimOrders)
    .where(eq(esimOrders.providerCheckoutId, input.checkoutId))
    .limit(1);
  if (!order || order.userId !== input.userId) throw new HttpError(404, "Order not found");

  if (order.status === "issued") {
    return { order, alreadyCompleted: true as const };
  }
  if (order.status === "issuing") {
    return { order, alreadyCompleted: false as const };
  }

  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw new HttpError(404, "User not found");

  if (order.status === "pending") {
    const claimed = await db
      .update(esimOrders)
      .set({
        status: "paid",
        providerPaymentId: input.providerPaymentId ?? input.checkoutId,
        updatedAt: new Date(),
      })
      .where(and(eq(esimOrders.id, order.id), eq(esimOrders.status, "pending")))
      .returning({ id: esimOrders.id });

    if (claimed.length === 0) {
      const [again] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
      if (!again) throw new HttpError(404, "Order not found");
      if (again.status === "issued") return { order: again, alreadyCompleted: true as const };
      // Another request owns payment/issue — do not call the provider again.
      return { order: again, alreadyCompleted: false as const };
    }

    await db.insert(payments).values({
      id: newId("pay"),
      userId: input.userId,
      provider: order.billingProvider,
      providerPaymentId: input.providerPaymentId ?? input.checkoutId,
      amount: order.amount,
      currency: order.currency,
      status: "succeeded",
    });
  } else if (order.status !== "paid" && order.status !== "failed") {
    throw new HttpError(400, "Order is not ready to complete");
  }

  return issueEsimForOrder(db, esim, email, order.id, input.correlationId);
}

export async function issueEsimForOrder(
  db: Db,
  esim: EsimProvider,
  email: EmailProvider,
  orderId: string,
  correlationId: string,
  pay?: OneTimePayments,
) {
  const [order] = await db.select().from(esimOrders).where(eq(esimOrders.id, orderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status === "issued") {
    return { order, alreadyCompleted: true as const };
  }
  if (order.status === "issuing") {
    return { order, alreadyCompleted: false as const };
  }
  if (order.status !== "paid" && order.status !== "failed") {
    throw new HttpError(400, "Order is not ready to issue");
  }

  // Atomic claim — only one concurrent caller may hit the wholesale provider.
  const claimed = await db
    .update(esimOrders)
    .set({
      status: "issuing",
      issueAttempts: order.issueAttempts + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(esimOrders.id, order.id), inArray(esimOrders.status, ["paid", "failed"])))
    .returning({ id: esimOrders.id });

  if (claimed.length === 0) {
    const [again] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
    if (!again) throw new HttpError(404, "Order not found");
    if (again.status === "issued") return { order: again, alreadyCompleted: true as const };
    return { order: again, alreadyCompleted: false as const };
  }

  const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
  if (!user) throw new HttpError(404, "User not found");

  // Idempotent: if a profile already exists (partial prior success), reuse it.
  const existingProfile = await db
    .select()
    .from(esimProfiles)
    .where(eq(esimProfiles.orderId, order.id))
    .limit(1);
  if (existingProfile.length > 0) {
    await db
      .update(esimOrders)
      .set({ status: "issued", lastError: null, updatedAt: new Date() })
      .where(eq(esimOrders.id, order.id));
    const [updated] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
    return { order: updated!, alreadyCompleted: true as const };
  }

  try {
    if (!user.email) {
      throw new Error("eSIM orders require an email on the account");
    }
    const issued = await esim.createOrder({
      clientRef: order.id,
      email: user.email,
      packageCode: order.packageCode,
      firstName: user.name?.split(" ")[0],
      lastName: user.name?.split(" ").slice(1).join(" ") || undefined,
    });

    await db
      .update(esimOrders)
      .set({
        status: "issued",
        providerOrderId: issued.providerOrderId,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(esimOrders.id, order.id));

    await db.insert(esimProfiles).values({
      id: newId("esp"),
      orderId: order.id,
      userId: order.userId,
      iccid: issued.iccid ?? null,
      qrCodeUrl: issued.qrCodeUrl ?? null,
      activationUrl: issued.activationUrl ?? null,
      status: issued.status,
      issuedAt: new Date(),
    });

    await db.insert(providerEvents).values({
      id: newId("pev"),
      provider: "esim",
      direction: "outbound",
      action: "createOrder",
      status: "success",
      targetId: order.id,
      correlationId,
      metadataJson: JSON.stringify({ providerOrderId: issued.providerOrderId }),
    });

    await writeAudit(db, {
      actorId: order.userId,
      actorType: "user",
      action: "esim.issued",
      targetType: "esim_order",
      targetId: order.id,
      correlationId,
    });

    await sendEmailSafe(email, {
      to: user.email!,
      template: "esim_ready",
      vars: {
        name: user.name ?? "there",
        packageName: order.packageName,
        link: "/dashboard/esim",
        actionUrl: "/dashboard/esim",
      },
      correlationId,
    });

    const [updated] = await db.select().from(esimOrders).where(eq(esimOrders.id, order.id)).limit(1);
    return { order: updated!, alreadyCompleted: false as const };
  } catch (err) {
    const message = err instanceof EsimProviderError ? err.message : "Issue failed";
    // ResellPortal has no idempotency key, so only retry when the provider clearly refused.
    const outcome = classifyIssueError(err);
    const attempts = order.issueAttempts + 1;
    const status =
      outcome === "unknown"
        ? "needs_review"
        : outcome === "rejected" || attempts >= MAX_ESIM_ISSUE_ATTEMPTS
          ? "refund_due"
          : "failed";
    await db
      .update(esimOrders)
      .set({
        status,
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(esimOrders.id, order.id));

    await db.insert(providerEvents).values({
      id: newId("pev"),
      provider: "esim",
      direction: "outbound",
      action: "createOrder",
      status: "error",
      targetId: order.id,
      correlationId,
      metadataJson: JSON.stringify({
        code: err instanceof EsimProviderError ? err.code : "unknown",
        outcome,
      }),
    });

    if (status === "refund_due" && pay) {
      await refundEsimOrder(db, pay, email, order.id, correlationId, `Not issued: ${message}`).catch(() => {
        // Stays refund_due; reconcile retries the refund.
      });
    }

    throw new HttpError(502, CUSTOMER_ESIM_ISSUE_ERROR);
  }
}

export async function listUserEsimOrders(db: Db, userId: string) {
  const orders = await db
    .select()
    .from(esimOrders)
    .where(eq(esimOrders.userId, userId))
    .orderBy(desc(esimOrders.createdAt));
  const profiles = await db.select().from(esimProfiles).where(eq(esimProfiles.userId, userId));
  const byOrder = new Map(profiles.map((p) => [p.orderId, p]));
  return orders.map((o) => ({ order: o, profile: byOrder.get(o.id) ?? null }));
}

export async function reconcileEsimOrders(
  db: Db,
  esim: EsimProvider,
  email: EmailProvider,
  correlationId: string,
  options?: { userId?: string; payments?: OneTimePayments; now?: Date },
) {
  const now = options?.now ?? new Date();
  const forUser = (cond: ReturnType<typeof eq>) =>
    options?.userId ? and(cond, eq(esimOrders.userId, options.userId)) : cond;

  // 1. "issuing" rows whose process died. The provider may have issued, so never retry them
  // automatically: mark issued if we stored a profile, otherwise hand them to a person.
  const stuckIssuing = await db
    .select()
    .from(esimOrders)
    .where(
      and(
        forUser(eq(esimOrders.status, "issuing")),
        lt(esimOrders.updatedAt, new Date(now.getTime() - STALE_ISSUING_MS)),
      ),
    )
    .limit(20);
  let needsReview = 0;
  for (const stuck of stuckIssuing) {
    const [profile] = await db.select().from(esimProfiles).where(eq(esimProfiles.orderId, stuck.id)).limit(1);
    await db
      .update(esimOrders)
      .set(
        profile
          ? { status: "issued", updatedAt: new Date() }
          : { status: "needs_review", lastError: "Process stopped while issuing; check the provider panel", updatedAt: new Date() },
      )
      .where(and(eq(esimOrders.id, stuck.id), eq(esimOrders.status, "issuing")));
    if (!profile) needsReview += 1;
  }

  // 2. Pending Stripe checkouts whose webhook never arrived.
  let confirmed = 0;
  if (options?.payments && options.payments.provider === "stripe") {
    const pending = await db
      .select()
      .from(esimOrders)
      .where(
        and(
          forUser(eq(esimOrders.status, "pending")),
          eq(esimOrders.billingProvider, "stripe"),
          lt(esimOrders.createdAt, new Date(now.getTime() - PENDING_CHECK_AFTER_MS)),
        ),
      )
      .limit(20);
    for (const order of pending) {
      if (!order.providerCheckoutId) continue;
      try {
        const session = await options.payments.getCheckoutSession(order.providerCheckoutId);
        if (!session || session.status === "expired") {
          await expireEsimCheckout(db, order.providerCheckoutId);
        } else if (session.paymentStatus === "paid") {
          await confirmEsimPayment(db, esim, email, options.payments, {
            checkoutSessionId: order.providerCheckoutId,
            paymentStatus: session.paymentStatus,
            paymentIntentId: session.paymentIntentId,
            amountTotal: session.amountTotal,
            currency: session.currency,
            correlationId,
          });
          confirmed += 1;
        }
      } catch {
        // Stripe unreachable: try again next run.
      }
    }
  }

  // 3. Paid orders not yet issued, and refusals worth retrying (wallet topped up, rate limit over).
  const retryable = await db
    .select()
    .from(esimOrders)
    .where(forUser(inArray(esimOrders.status, ["paid", "failed"])))
    .limit(50);
  let issued = 0;
  let errors = 0;
  for (const order of retryable) {
    try {
      await issueEsimForOrder(db, esim, email, order.id, correlationId, options?.payments);
      issued += 1;
    } catch {
      errors += 1;
    }
  }

  // 4. Refunds that failed earlier.
  let refunded = 0;
  if (options?.payments) {
    const due = await db.select().from(esimOrders).where(forUser(eq(esimOrders.status, "refund_due"))).limit(20);
    for (const order of due) {
      try {
        await refundEsimOrder(db, options.payments, email, order.id, correlationId, order.lastError ?? "Not issued");
        refunded += 1;
      } catch {
        errors += 1;
      }
    }
  }

  return { retried: retryable.length, issued, errors, confirmed, refunded, needsReview };
}
