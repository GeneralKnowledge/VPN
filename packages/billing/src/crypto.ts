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
 * Crypto billing adapter skeleton — we never custody wallets or private keys.
 * Wire a trusted processor (e.g. BTCPay, Coinbase Commerce, NOWPayments) when activating.
 * All crypto plans are prepaid one-offs: pay once, access until period end.
 */
export class CryptoBillingProvider implements BillingProvider {
  constructor(
    private readonly config: {
      apiKey?: string;
      webhookSecret?: string;
    } = {},
  ) {}

  private ensureConfigured() {
    if (!this.config.apiKey) {
      throw new BillingProviderError(
        "Crypto billing is not configured. Set CRYPTO_BILLING_PROVIDER=mock for development, or wire a processor API key.",
        "unauthorized",
      );
    }
  }

  async getProviderStatus() {
    if (!this.config.apiKey) {
      return { ok: false, provider: "crypto", detail: "Missing crypto processor credentials" };
    }
    return { ok: true, provider: "crypto", detail: "Configured (live verification deferred)" };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    this.ensureConfigured();
    if (input.paymentRail !== "crypto") {
      throw new BillingProviderError("Crypto provider only accepts crypto rail checkouts", "validation");
    }
    if (input.billingMode !== "prepaid") {
      throw new BillingProviderError("Crypto checkouts are prepaid one-offs only", "validation");
    }
    throw new BillingProviderError(
      "Crypto checkout requires a processor integration to be activated.",
      "unavailable",
      true,
    );
  }

  async completeCheckout(_sessionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Use crypto processor webhooks to finalize prepaid access", "unavailable");
  }

  async getSubscription(_subscriptionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Crypto getSubscription not activated", "unavailable");
  }

  async cancelSubscription(_subscriptionId: string): Promise<BillingSubscription> {
    this.ensureConfigured();
    throw new BillingProviderError("Crypto cancelSubscription not activated", "unavailable");
  }

  async resumeSubscription(_subscriptionId: string): Promise<BillingSubscription> {
    throw new BillingProviderError("Prepaid crypto access cannot be resumed — purchase again when it ends", "validation");
  }

  async changePlan(_subscriptionId: string, _planId: string): Promise<BillingSubscription> {
    throw new BillingProviderError("Prepaid crypto plans cannot be changed mid-period", "validation");
  }

  async listInvoices(_customerId: string): Promise<Invoice[]> {
    return [];
  }

  async verifyWebhook(payload: string, signature: string | null): Promise<BillingWebhookEvent> {
    if (!this.config.webhookSecret) {
      throw new BillingProviderError("Missing crypto webhook secret", "unauthorized");
    }
    if (!signature) {
      throw new BillingProviderError("Missing crypto webhook signature", "unauthorized");
    }
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
