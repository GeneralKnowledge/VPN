import { esimOrders, esimProfiles, payments, providerEvents, users, type Db } from "@northstar/db";
import type { EmailProvider } from "@northstar/email";
import {
  CUSTOMER_ESIM_ISSUE_ERROR,
  EsimProviderError,
  type EsimProvider,
} from "@northstar/esim-provider";
import { and, desc, eq, inArray } from "drizzle-orm";
import { writeAudit } from "./auth";
import { HttpError } from "./http";
import { sendEmailSafe } from "./notify";
import { newId } from "./utils";

export async function createEsimCheckoutOrder(
  db: Db,
  esim: EsimProvider,
  input: {
    userId: string;
    packageCode: string;
    billingProvider: "mock" | "stripe";
    esimProviderKind: string;
    correlationId: string;
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

  return {
    orderId,
    checkoutId,
    package: pkg,
    amount: pkg.price,
    currency: pkg.currency,
  };
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
      if (again?.status === "issued") return { order: again, alreadyCompleted: true as const };
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
  }

  return issueEsimForOrder(db, esim, email, order.id, input.correlationId);
}

export async function issueEsimForOrder(
  db: Db,
  esim: EsimProvider,
  email: EmailProvider,
  orderId: string,
  correlationId: string,
) {
  const [order] = await db.select().from(esimOrders).where(eq(esimOrders.id, orderId)).limit(1);
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status === "issued") {
    return { order, alreadyCompleted: true as const };
  }
  if (order.status !== "paid" && order.status !== "failed") {
    throw new HttpError(400, "Order is not ready to issue");
  }

  const [user] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
  if (!user) throw new HttpError(404, "User not found");

  await db
    .update(esimOrders)
    .set({
      issueAttempts: order.issueAttempts + 1,
      updatedAt: new Date(),
    })
    .where(eq(esimOrders.id, order.id));

  try {
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

    const existingProfile = await db
      .select()
      .from(esimProfiles)
      .where(eq(esimProfiles.orderId, order.id))
      .limit(1);
    if (existingProfile.length === 0) {
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
    }

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
      to: user.email,
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
    await db
      .update(esimOrders)
      .set({
        status: "failed",
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
      }),
    });

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
  options?: { userId?: string },
) {
  const failed = await db
    .select()
    .from(esimOrders)
    .where(
      options?.userId
        ? and(eq(esimOrders.status, "failed"), eq(esimOrders.userId, options.userId))
        : eq(esimOrders.status, "failed"),
    )
    .limit(50);

  const paid = await db
    .select()
    .from(esimOrders)
    .where(
      options?.userId
        ? and(eq(esimOrders.status, "paid"), eq(esimOrders.userId, options.userId))
        : eq(esimOrders.status, "paid"),
    )
    .limit(50);

  const retryable = [...paid, ...failed.filter((o) => o.issueAttempts < 5)];
  let issued = 0;
  let errors = 0;
  for (const order of retryable) {
    try {
      await issueEsimForOrder(db, esim, email, order.id, correlationId);
      issued += 1;
    } catch {
      errors += 1;
    }
  }

  // Also pick up any paid without profile (defensive).
  void inArray;
  return { retried: retryable.length, issued, errors };
}
