import { createHash, timingSafeEqual } from "node:crypto";
import type {
  BillingMode,
  BillingProvider,
  BillingSubscription,
  BillingWebhookEvent,
  CheckoutSession,
  CreateCheckoutInput,
  Invoice,
  PaymentRail,
  SubscriptionStatus,
} from "./types";
import { BillingProviderError, periodEndFrom } from "./types";

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Constant-time compare via SHA-256 digests (equal length). */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

type StoredCheckout = CheckoutSession & {
  email: string | null;
  billingInterval: "month" | "year";
  amount: number;
};

function inferInterval(planId: string): "month" | "year" {
  return planId.includes("annual") || planId.includes("year") ? "year" : "month";
}

function inferPrepaid(planId: string, billingMode?: BillingMode): boolean {
  if (billingMode) return billingMode === "prepaid";
  // Legacy / hydrated sessions: crypto + gold plans are prepaid one-offs.
  return /^(bronze|iron|gold)-/.test(planId) || planId.includes("crypto");
}

export class MockBillingProvider implements BillingProvider {
  private checkouts = new Map<string, StoredCheckout>();
  private subscriptions = new Map<string, BillingSubscription>();
  private invoices = new Map<string, Invoice[]>();
  private idempotency = new Map<string, CheckoutSession>();

  /**
   * Shared secret for mock webhooks (reuse STRIPE_WEBHOOK_SECRET in app wiring).
   * Empty secret → all webhook signatures are invalid (fail closed).
   */
  constructor(
    private readonly webhookSecret = "",
    private readonly defaultRail: PaymentRail = "stripe",
  ) {}

  async getProviderStatus() {
    return {
      ok: true,
      provider: "mock",
      detail: `Mock billing operational (default rail: ${this.defaultRail})`,
    };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (input.idempotencyKey && this.idempotency.has(input.idempotencyKey)) {
      return { ...this.idempotency.get(input.idempotencyKey)! };
    }
    const session: StoredCheckout = {
      id: id(input.paymentRail === "crypto" ? "cs_crypto" : "cs_mock"),
      url: `/billing/mock-checkout?session_id=pending`,
      planId: input.planId,
      customerId: input.customerId,
      status: "open",
      email: input.customerEmail,
      billingMode: input.billingMode,
      paymentRail: input.paymentRail,
      billingInterval: input.billingInterval,
      amount: input.amount,
    };
    session.url = `/billing/mock-checkout?session_id=${session.id}`;
    this.checkouts.set(session.id, session);
    const publicSession: CheckoutSession = {
      id: session.id,
      url: session.url,
      planId: session.planId,
      customerId: session.customerId,
      status: session.status,
      billingMode: session.billingMode,
      paymentRail: session.paymentRail,
    };
    if (input.idempotencyKey) this.idempotency.set(input.idempotencyKey, publicSession);
    return { ...publicSession };
  }

  async completeCheckout(sessionId: string): Promise<BillingSubscription> {
    let session = this.checkouts.get(sessionId);
    // Survive process restarts / HMR: allow completing known mock session ids
    if (!session && (sessionId.startsWith("cs_mock_") || sessionId.startsWith("cs_crypto_"))) {
      const rail: PaymentRail = sessionId.startsWith("cs_crypto_") ? "crypto" : this.defaultRail;
      const planId = "platinum-monthly";
      session = {
        id: sessionId,
        url: `/billing/mock-checkout?session_id=${sessionId}`,
        planId,
        customerId: "unknown",
        status: "open",
        email: "unknown@localhost",
        billingMode: "subscription",
        paymentRail: rail,
        billingInterval: "month",
        amount: 499,
      };
      this.checkouts.set(sessionId, session);
    }
    if (!session) throw new BillingProviderError("Checkout session not found", "not_found");
    if (session.status === "complete") {
      const existing = [...this.subscriptions.values()].find(
        (s) => s.customerId === session!.customerId && s.planId === session!.planId,
      );
      if (existing) return { ...existing };
    }
    session.status = "complete";
    const prepaid = inferPrepaid(session.planId, session.billingMode);
    const interval = session.billingInterval || inferInterval(session.planId);
    const periodEnd = periodEndFrom(new Date(), interval);
    const provider: BillingSubscription["provider"] =
      session.paymentRail === "crypto" ? "crypto" : "mock";
    const sub: BillingSubscription = {
      id: id(provider === "crypto" ? "sub_crypto" : "sub_mock"),
      customerId: session.customerId,
      planId: session.planId,
      status: "active",
      currentPeriodEnd: periodEnd.toISOString(),
      // Prepaid one-offs never renew — they simply expire at period end.
      cancelAtPeriodEnd: prepaid,
      provider,
      billingMode: prepaid ? "prepaid" : "subscription",
    };
    this.subscriptions.set(sub.id, sub);
    const invoice: Invoice = {
      id: id("inv_mock"),
      customerId: session.customerId,
      amount: session.amount || (interval === "year" ? 3999 : 499),
      currency: "GBP",
      status: "paid",
      createdAt: new Date().toISOString(),
    };
    const list = this.invoices.get(session.customerId) ?? [];
    list.unshift(invoice);
    this.invoices.set(session.customerId, list);
    return { ...sub };
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscription> {
    let sub = this.subscriptions.get(subscriptionId);
    // Survive process restarts / HMR / DB seed: seed and prior checkouts use sub_mock_* ids
    // that are not in this process's memory map.
    if (!sub && (subscriptionId.startsWith("sub_mock_") || subscriptionId.startsWith("sub_crypto_"))) {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      sub = {
        id: subscriptionId,
        customerId: "unknown",
        planId: "platinum-monthly",
        status: "active",
        currentPeriodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: subscriptionId.startsWith("sub_crypto_"),
        provider: subscriptionId.startsWith("sub_crypto_") ? "crypto" : "mock",
        billingMode: subscriptionId.startsWith("sub_crypto_") ? "prepaid" : "subscription",
      };
      this.subscriptions.set(subscriptionId, sub);
    }
    if (!sub) throw new BillingProviderError("Subscription not found", "not_found");
    return { ...sub };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<BillingSubscription> {
    const sub = await this.getSubscription(subscriptionId);
    if (sub.billingMode === "prepaid") {
      // Prepaid already ends at period end; immediate cancel cuts access now.
      if (!atPeriodEnd) {
        sub.status = "cancelled";
        sub.cancelAtPeriodEnd = false;
      } else {
        sub.cancelAtPeriodEnd = true;
        sub.status = "cancelling";
      }
      this.subscriptions.set(subscriptionId, sub);
      return { ...sub };
    }
    if (atPeriodEnd) {
      sub.cancelAtPeriodEnd = true;
      sub.status = "cancelling";
    } else {
      sub.status = "cancelled";
      sub.cancelAtPeriodEnd = false;
    }
    this.subscriptions.set(subscriptionId, sub);
    return { ...sub };
  }

  async resumeSubscription(subscriptionId: string): Promise<BillingSubscription> {
    const sub = await this.getSubscription(subscriptionId);
    if (sub.billingMode === "prepaid") {
      throw new BillingProviderError("Prepaid access cannot be resumed — purchase again when it ends", "validation");
    }
    if (sub.status === "cancelled") {
      throw new BillingProviderError("Cannot resume cancelled subscription", "validation");
    }
    sub.cancelAtPeriodEnd = false;
    sub.status = "active";
    this.subscriptions.set(subscriptionId, sub);
    return { ...sub };
  }

  async changePlan(subscriptionId: string, planId: string): Promise<BillingSubscription> {
    const sub = await this.getSubscription(subscriptionId);
    if (sub.billingMode === "prepaid") {
      throw new BillingProviderError("Prepaid plans cannot be changed mid-period", "validation");
    }
    sub.planId = planId;
    this.subscriptions.set(subscriptionId, sub);
    return { ...sub };
  }

  async listInvoices(customerId: string): Promise<Invoice[]> {
    return [...(this.invoices.get(customerId) ?? [])];
  }

  async verifyWebhook(payload: string, signature: string | null): Promise<BillingWebhookEvent> {
    // Fail closed: unsigned / guessable signatures must never activate billing.
    const signatureValid =
      Boolean(this.webhookSecret) &&
      typeof signature === "string" &&
      signature.length > 0 &&
      safeEqual(signature, this.webhookSecret);
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      throw new BillingProviderError("Invalid webhook payload", "validation");
    }
    const typed = data as { id?: string; type?: string };
    return {
      id: typed.id ?? id("evt_mock"),
      type: typed.type ?? "mock.event",
      data,
      signatureValid,
    };
  }

  async simulatePaymentFailed(subscriptionId: string): Promise<BillingSubscription> {
    const sub = await this.getSubscription(subscriptionId);
    if (sub.billingMode === "prepaid") {
      throw new BillingProviderError("Prepaid access has no renewals to fail", "validation");
    }
    const next: SubscriptionStatus = "past_due";
    sub.status = next;
    this.subscriptions.set(subscriptionId, sub);
    return { ...sub };
  }

  _seedSubscription(sub: BillingSubscription) {
    this.subscriptions.set(sub.id, sub);
  }
}
