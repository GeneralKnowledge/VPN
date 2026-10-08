import { and, eq } from "drizzle-orm";
import { BillingProviderError } from "@northstar/billing";
import { getPlan } from "@northstar/config";
import { webhookEvents } from "@northstar/db";
import { getBillingProvider, getDb, getEmailProvider, getEnv, getVpnProvider } from "@/lib/providers";
import {
  activateSubscription,
  handlePaymentFailed,
  handleRenewal,
  handleSubscriptionEnded,
} from "@/lib/services";
import { correlationId, newId } from "@/lib/utils";

type StripeObject = {
  id?: string;
  subscription?: string | null;
  amount_paid?: number;
  billing_reason?: string;
  metadata?: { userId?: string; planId?: string };
};

type EventData = {
  data?: { object?: StripeObject };
  userId?: string;
  planId?: string;
  subscriptionId?: string;
  paymentId?: string;
  amount?: number;
};

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") ?? req.headers.get("x-northstar-signature");
  const billing = getBillingProvider();

  let event;
  try {
    event = await billing.verifyWebhook(raw, signature);
  } catch (err) {
    if (err instanceof BillingProviderError && err.code === "validation") {
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  // Always reject invalid signatures — including mock billing in development.
  // Otherwise an attacker can POST checkout.session.completed for any userId
  // and receive a free active subscription + VPN provision.
  if (!event.signatureValid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const db = getDb();
  const where = and(eq(webhookEvents.provider, "stripe"), eq(webhookEvents.eventId, event.id));
  let [existing] = await db.select().from(webhookEvents).where(where).limit(1);
  if (existing?.processedAt) return Response.json({ ok: true, deduped: true });

  if (!existing) {
    try {
      await db.insert(webhookEvents).values({
        id: newId("wh"),
        provider: "stripe",
        eventId: event.id,
        eventType: event.type,
        payloadJson: raw,
        signatureValid: event.signatureValid,
      });
    } catch {
      // A concurrent delivery of the same event inserted first.
    }
    [existing] = await db.select().from(webhookEvents).where(where).limit(1);
  }
  const rowId = existing!.id;

  const corr = correlationId();
  try {
    const data = event.data as EventData;
    const obj = data.data?.object;
    const env = getEnv();
    const provider = env.BILLING_PROVIDER === "stripe" ? "stripe" : "mock";
    const vpn = getVpnProvider();
    const subscriptionId = data.subscriptionId ?? obj?.subscription ?? obj?.id;

    switch (event.type) {
      case "checkout.session.completed":
      case "mock.checkout.completed": {
        const userId = data.userId ?? obj?.metadata?.userId;
        const planId = data.planId ?? obj?.metadata?.planId;
        const plan = planId ? getPlan(planId) : undefined;
        if (!userId || !plan) throw new Error("Checkout event is missing a valid user or plan");
        const providerSubscriptionId = data.subscriptionId ?? obj?.subscription ?? obj?.id;
        if (!providerSubscriptionId) throw new Error("Checkout event is missing a subscription id");
        await activateSubscription(db, vpn, getEmailProvider(), {
          userId,
          planId: plan.id,
          providerSubscriptionId,
          provider,
          amount: obj?.amount_paid ?? plan.price,
          correlationId: corr,
        });
        break;
      }
      case "invoice.payment_failed":
      case "mock.payment_failed": {
        if (subscriptionId) {
          await handlePaymentFailed(db, vpn, getEmailProvider(), { providerSubscriptionId: subscriptionId }, corr);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "mock.invoice.paid": {
        // The first invoice of a subscription is recorded by the checkout event itself.
        if (obj?.billing_reason === "subscription_create") break;
        const paymentId = data.paymentId ?? obj?.id ?? event.id;
        if (subscriptionId) {
          await handleRenewal(
            db,
            vpn,
            {
              providerSubscriptionId: subscriptionId,
              providerPaymentId: paymentId,
              amount: data.amount ?? obj?.amount_paid ?? 0,
              provider,
            },
            corr,
          );
        }
        break;
      }
      case "customer.subscription.deleted":
      case "mock.subscription.deleted": {
        const id = data.subscriptionId ?? obj?.id;
        if (id) await handleSubscriptionEnded(db, vpn, { providerSubscriptionId: id }, corr);
        break;
      }
      default:
        break;
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), processingError: null, updatedAt: new Date() })
      .where(eq(webhookEvents.id, rowId));
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhook:stripe]", event.type, err);
    await db
      .update(webhookEvents)
      .set({
        processingError: err instanceof Error ? err.message : "error",
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, rowId));
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
