import type {
  BillingProvider,
  BillingSubscription,
  BillingWebhookEvent,
  CheckoutSession,
  CreateCheckoutInput,
  Invoice,
} from "./types";
import { BillingProviderError } from "./types";

/**
 * Stripe adapter skeleton — compiles without Stripe credentials.
 * Live calls require STRIPE_SECRET_KEY. Prefer Stripe SDK when activating.
 * No invented Stripe endpoints; methods throw until configured.
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

  async createCheckout(_input: CreateCheckoutInput): Promise<CheckoutSession> {
    this.ensureConfigured();
    // Production activation: use Stripe Checkout Sessions API via official SDK.
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
    // Production: stripe.webhooks.constructEvent(payload, signature, secret).
    // Until the Stripe SDK is wired, never treat a signature as valid — a "t="
    // prefix check is forgeable and must not activate subscriptions.
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      throw new BillingProviderError("Invalid JSON payload", "validation");
    }
    return {
      id: (data as { id?: string }).id ?? "evt_unknown",
      type: (data as { type?: string }).type ?? "unknown",
      data,
      signatureValid: false,
    };
  }
}
