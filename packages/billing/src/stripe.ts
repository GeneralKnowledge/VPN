import type {
  BillingProvider,
  BillingSubscription,
  BillingWebhookEvent,
  CheckoutSession,
  CreateCheckoutInput,
  Invoice,
} from "./types";
import { BillingProviderError } from "./types";
import { verifyStripeSignature } from "./stripe-payments";

/**
 * Stripe adapter skeleton — compiles without Stripe credentials.
 * Live calls require STRIPE_SECRET_KEY. Prefer Stripe SDK when activating.
 * Subscription vs prepaid (Gold one-offs) is selected via input.billingMode.
 */
export class StripeBillingProvider implements BillingProvider {
  constructor(
    private readonly config: {
      secretKey: string;
      webhookSecret: string;
      priceMap: Record<string, string>;
      fetchFn?: typeof fetch;
    },
  ) {}

  private ensureConfigured() {
    if (!this.config.secretKey) {
      throw new BillingProviderError(
        "Stripe is not configured. Set STRIPE_SECRET_KEY or use BILLING_PROVIDER=mock.",
        "unauthorized",
      );
    }
  }

  async getProviderStatus() {
    if (!this.config.secretKey) {
      return { ok: false, provider: "stripe", detail: "Missing STRIPE_SECRET_KEY" };
    }
    return { ok: true, provider: "stripe", detail: "Configured (live verification deferred)" };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    this.ensureConfigured();
    if (input.paymentRail !== "stripe") {
      throw new BillingProviderError("Stripe provider cannot take crypto rail checkouts", "validation");
    }
    // Production: Checkout Session in subscription mode, or payment mode for prepaid (Gold).
    void input.billingMode;
    throw new BillingProviderError(
      "Stripe checkout requires the Stripe SDK integration to be activated with live price IDs.",
      "unavailable",
      true,
    );
  }

  async completeCheckout(_sessionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Use Stripe webhooks to finalize subscriptions", "unavailable");
  }

  async getSubscription(_subscriptionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Stripe getSubscription not activated", "unavailable");
  }

  async cancelSubscription(_subscriptionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Stripe cancelSubscription not activated", "unavailable");
  }

  async resumeSubscription(_subscriptionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Stripe resumeSubscription not activated", "unavailable");
  }

  async changePlan(_subscriptionId: string, _planId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Stripe changePlan not activated", "unavailable");
  }

  async listInvoices(_customerId: string): Promise<Invoice[]> {
    this.ensureConfigured();
    return [];
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
