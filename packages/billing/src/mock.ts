import { createHash, timingSafeEqual } from "node:crypto";
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

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Constant-time compare via SHA-256 digests (equal length). */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

export class MockBillingProvider implements BillingProvider {
  private checkouts = new Map<string, CheckoutSession & { email: string }>();
  private subscriptions = new Map<string, BillingSubscription>();
  private invoices = new Map<string, Invoice[]>();
  private idempotency = new Map<string, CheckoutSession>();

  /**
   * Shared secret for mock webhooks (reuse STRIPE_WEBHOOK_SECRET in app wiring).
   * Empty secret → all webhook signatures are invalid (fail closed).
   */
  constructor(private readonly webhookSecret = "") {}

  async getProviderStatus() {
    return { ok: true, provider: "mock", detail: "Mock billing operational" };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (input.idempotencyKey && this.idempotency.has(input.idempotencyKey)) {
      return { ...this.idempotency.get(input.idempotencyKey)! };
    }
    const session: CheckoutSession & { email: string } = {
      id: id("cs_mock"),
      url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}session_id=pending`,
      planId: input.planId,
      customerId: input.customerId,
      status: "open",
      email: input.customerEmail,
    };
    // Point to local mock checkout completion page
    session.url = `/billing/mock-checkout?session_id=${session.id}`;
    this.checkouts.set(session.id, session);
    if (input.idempotencyKey) this.idempotency.set(input.idempotencyKey, session);
    return {
      id: session.id,
      url: session.url,
      planId: session.planId,
      customerId: session.customerId,
      status: session.status,
    };
  }

  async completeCheckout(sessionId: string): Promise<BillingSubscription> {
    let session = this.checkouts.get(sessionId);
    // Survive process restarts / HMR: allow completing known mock session ids
    if (!session && sessionId.startsWith("cs_mock_")) {
      session = {
        id: sessionId,
        url: `/billing/mock-checkout?session_id=${sessionId}`,
        planId: "premium-monthly",
        customerId: "unknown",
        status: "open",
        email: "unknown@localhost",
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
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (session.planId.includes("annual") ? 12 : 1));
    const sub: BillingSubscription = {
      id: id("sub_mock"),
      customerId: session.customerId,
      planId: session.planId,
      status: "active",
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      provider: "mock",
    };
    this.subscriptions.set(sub.id, sub);
    const invoice: Invoice = {
      id: id("inv_mock"),
      customerId: session.customerId,
      amount: session.planId.includes("annual") ? 3999 : 499,
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
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new BillingProviderError("Subscription not found", "not_found");
    return { ...sub };
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<BillingSubscription> {
    const sub = await this.getSubscription(subscriptionId);
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
    const next: SubscriptionStatus = sub.status === "past_due" ? "past_due" : "past_due";
    sub.status = next;
    this.subscriptions.set(subscriptionId, sub);
    return { ...sub };
  }

  _seedSubscription(sub: BillingSubscription) {
    this.subscriptions.set(sub.id, sub);
  }
}
