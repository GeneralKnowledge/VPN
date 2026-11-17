import type {
  BillingProvider,
  BillingSubscription,
  BillingWebhookEvent,
  CheckoutSession,
  CreateCheckoutInput,
  Invoice,
  SubscriptionStatus,
} from "./types";
import { BillingProviderError } from "./types";
import { StripeRestClient, toStripeForm, verifyStripeSignature, type StripeClientConfig } from "./stripe-payments";

/** Checkout sessions Stripe accepts last 30 minutes to 24 hours; an hour is plenty to pay. */
const CHECKOUT_LIFETIME_SECONDS = 3600;

/**
 * Stripe billing for the VPN plans, over the REST API with no SDK.
 *
 * - `subscription` plans (Platinum, Diamond) use Checkout in subscription mode with a recurring
 *   Price from `priceMap`; Stripe renews them and tells us through `invoice.*` webhooks.
 * - `prepaid` plans (Gold) use Checkout in payment mode with a one-time Price; the local
 *   subscription row is keyed by the Checkout Session id and simply ends at period end.
 *
 * Nothing is granted here: access starts only when the signed `checkout.session.completed`
 * webhook says the session is paid.
 */
export class StripeBillingProvider implements BillingProvider {
  private readonly client: StripeRestClient;

  constructor(
    private readonly config: StripeClientConfig & {
      webhookSecret: string;
      priceMap: Record<string, string>;
      /**
       * Card-statement suffix for one-off (prepaid) plans. Subscription renewals take the
       * statement descriptor of the Stripe Product behind the Price, set in the dashboard.
       */
      statementSuffix?: string;
    },
  ) {
    this.client = new StripeRestClient(config);
  }

  async getProviderStatus() {
    if (!this.config.secretKey) {
      return { ok: false, provider: "stripe", detail: "Missing STRIPE_SECRET_KEY" };
    }
    if (/^(sk|rk)_live_/.test(this.config.secretKey) && !this.config.allowLiveKeys) {
      return { ok: false, provider: "stripe", detail: "Live key refused until STRIPE_ALLOW_LIVE_PAYMENTS=true" };
    }
    const mode = this.config.secretKey.includes("_test_") ? "test mode" : "live mode";
    return { ok: true, provider: "stripe", detail: `Configured (${mode})` };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (input.paymentRail !== "stripe") {
      throw new BillingProviderError("Stripe provider cannot take crypto rail checkouts", "validation");
    }
    const price = this.config.priceMap[input.planId];
    if (!price) {
      throw new BillingProviderError(
        `No Stripe price is configured for plan ${input.planId}. Set its STRIPE_PRICE_* variable.`,
        "unavailable",
      );
    }
    const subscription = input.billingMode === "subscription";
    const metadata = { kind: "vpn", userId: input.customerId, planId: input.planId };
    const body = toStripeForm({
      mode: subscription ? "subscription" : "payment",
      client_reference_id: input.customerId,
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_LIFETIME_SECONDS,
      line_items: [{ price, quantity: 1 }],
      metadata,
      // Copied onto the subscription or payment so later events can be traced to the customer.
      ...(subscription
        ? { subscription_data: { metadata } }
        : {
            payment_intent_data: {
              metadata,
              statement_descriptor_suffix: this.config.statementSuffix || undefined,
            },
          }),
    });
    const session = await this.client.request<{ id?: string; url?: string }>(
      "POST",
      "/checkout/sessions",
      body,
      input.idempotencyKey,
    );
    if (!session.id || !session.url) {
      throw new BillingProviderError("Stripe returned a session without an id or url", "unknown", true);
    }
    return {
      id: session.id,
      url: session.url,
      planId: input.planId,
      customerId: input.customerId,
      status: "open",
      billingMode: input.billingMode,
      paymentRail: "stripe",
    };
  }

  async completeCheckout(_sessionId: string): Promise<BillingSubscription> {
    throw new BillingProviderError("Stripe checkouts are confirmed by signed webhooks", "unavailable");
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscription> {
    if (!isStripeSubscriptionId(subscriptionId)) return prepaidResult(subscriptionId);
    const s = await this.client.request<Record<string, unknown>>(
      "GET",
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    return parseStripeSubscription(s);
  }

  /**
   * At period end: Stripe stops renewing and sends `customer.subscription.deleted` when it ends.
   * Immediately: Stripe cancels now (no proration refund; refunds are a separate decision).
   * Prepaid (Gold) access has nothing at Stripe to cancel.
   */
  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<BillingSubscription> {
    if (!isStripeSubscriptionId(subscriptionId)) return prepaidResult(subscriptionId);
    const path = `/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const s = atPeriodEnd
      ? await this.client.request<Record<string, unknown>>(
          "POST",
          path,
          toStripeForm({ cancel_at_period_end: true }),
        )
      : await this.client.request<Record<string, unknown>>("DELETE", path);
    return parseStripeSubscription(s);
  }

  async resumeSubscription(subscriptionId: string): Promise<BillingSubscription> {
    if (!isStripeSubscriptionId(subscriptionId)) {
      throw new BillingProviderError("Prepaid access cannot be resumed", "validation");
    }
    const s = await this.client.request<Record<string, unknown>>(
      "POST",
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      toStripeForm({ cancel_at_period_end: false }),
    );
    return parseStripeSubscription(s);
  }

  async changePlan(_subscriptionId: string, _planId: string): Promise<BillingSubscription> {
    throw new BillingProviderError("Plan changes are not offered yet: cancel and subscribe again", "unavailable");
  }

  /** Invoices are recorded locally from webhooks; the dashboard reads those. */
  async listInvoices(_customerId: string): Promise<Invoice[]> {
    return [];
  }

  /**
   * The payment intent that paid an invoice, for refunds. Older API versions put it on the invoice;
   * newer ones list it under `payments`, which has to be expanded.
   */
  async paymentIntentForInvoice(invoiceId: string): Promise<string | null> {
    const inv = await this.client.request<Record<string, unknown>>(
      "GET",
      `/invoices/${encodeURIComponent(invoiceId)}?expand[]=payments`,
    );
    return paymentIntentFromInvoice(inv);
  }

  /** The invoice a payment intent paid, for matching `charge.refunded` on newer API versions. */
  async invoiceForPaymentIntent(paymentIntentId: string): Promise<string | null> {
    try {
      const list = await this.client.request<{ data?: Array<{ invoice?: unknown }> }>(
        "GET",
        `/invoice_payments?payment[type]=payment_intent&payment[payment_intent]=${encodeURIComponent(paymentIntentId)}`,
      );
      const inv = list.data?.[0]?.invoice;
      return typeof inv === "string" ? inv : null;
    } catch {
      // Older API versions have no invoice payments list; the charge carries the invoice instead.
      return null;
    }
  }

  async verifyWebhook(payload: string, signature: string | null): Promise<BillingWebhookEvent> {
    if (!this.config.webhookSecret) {
      throw new BillingProviderError("Missing STRIPE_WEBHOOK_SECRET", "unauthorized");
    }
    if (!signature) {
      throw new BillingProviderError("Missing Stripe-Signature header", "unauthorized");
    }
    // Same check as stripe.webhooks.constructEvent: HMAC over `${t}.${payload}`, constant-time
    // compare, 5-minute timestamp tolerance.
    if (!verifyStripeSignature(payload, signature, this.config.webhookSecret)) {
      throw new BillingProviderError("Invalid Stripe signature", "unauthorized");
    }
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      throw new BillingProviderError("Invalid JSON payload", "validation");
    }
    const id = (data as { id?: unknown }).id;
    const type = (data as { type?: unknown }).type;
    if (typeof id !== "string" || typeof type !== "string") {
      throw new BillingProviderError("Event is missing an id or type", "validation");
    }
    return { id, type, data, signatureValid: true };
  }
}

/** Renewing subscriptions have `sub_` ids; prepaid access is keyed by its Checkout Session. */
export function isStripeSubscriptionId(id: string): boolean {
  return id.startsWith("sub_");
}

function prepaidResult(id: string): BillingSubscription {
  return {
    id,
    customerId: "",
    planId: "",
    status: "cancelling",
    currentPeriodEnd: new Date().toISOString(),
    cancelAtPeriodEnd: true,
    provider: "stripe",
    billingMode: "prepaid",
  };
}

/** Maps Stripe's subscription statuses onto ours. */
export function mapStripeSubscriptionStatus(status: unknown, cancelAtPeriodEnd: boolean): SubscriptionStatus {
  switch (status) {
    case "active":
      return cancelAtPeriodEnd ? "cancelling" : "active";
    case "trialing":
      return cancelAtPeriodEnd ? "cancelling" : "trialing";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete_expired":
      return "expired";
    default:
      return "incomplete";
  }
}

/** Reads a Stripe Subscription object (API response or webhook payload). */
export function parseStripeSubscription(s: Record<string, unknown>): BillingSubscription {
  const cancelAtPeriodEnd = s.cancel_at_period_end === true;
  // Newer API versions moved current_period_end from the subscription onto its items.
  const items = (s.items as { data?: Array<{ current_period_end?: unknown }> } | undefined)?.data;
  const periodEnd =
    typeof s.current_period_end === "number"
      ? s.current_period_end
      : typeof items?.[0]?.current_period_end === "number"
        ? items[0].current_period_end
        : null;
  const metadata = (s.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(s.id ?? ""),
    customerId: typeof metadata.userId === "string" ? metadata.userId : String(s.customer ?? ""),
    planId: typeof metadata.planId === "string" ? metadata.planId : "",
    status: mapStripeSubscriptionStatus(s.status, cancelAtPeriodEnd),
    currentPeriodEnd: new Date((periodEnd ?? Date.now() / 1000) * 1000).toISOString(),
    cancelAtPeriodEnd,
    provider: "stripe",
    billingMode: "subscription",
  };
}

/** Finds the payment intent on an invoice, across API versions. */
export function paymentIntentFromInvoice(inv: Record<string, unknown>): string | null {
  const direct = idOf(inv.payment_intent);
  if (direct) return direct;
  const payments = (inv.payments as { data?: Array<{ payment?: { payment_intent?: unknown } }> } | undefined)?.data;
  for (const p of payments ?? []) {
    const pi = idOf(p.payment?.payment_intent);
    if (pi) return pi;
  }
  return null;
}

/** A Stripe reference is either an id string or an expanded object with an id. */
export function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id) return id;
  }
  return null;
}
