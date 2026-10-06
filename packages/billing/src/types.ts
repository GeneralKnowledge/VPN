import { z } from "zod";

export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "cancelling",
  "cancelled",
  "expired",
  "incomplete",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** App-level lifecycle separate from raw billing status */
export const customerLifecycleSchema = z.enum([
  "lead",
  "customer",
  "subscribed",
  "vpn_provisioned",
  "active",
  "grace_period",
  "suspended",
  "cancelled",
]);
export type CustomerLifecycle = z.infer<typeof customerLifecycleSchema>;

export interface CheckoutSession {
  id: string;
  url: string;
  planId: string;
  customerId: string;
  status: "open" | "complete" | "expired";
}

export interface BillingSubscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  provider: "mock" | "stripe";
}

export interface Invoice {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  status: "paid" | "open" | "void" | "uncollectible";
  createdAt: string;
  pdfUrl?: string;
}

export interface BillingWebhookEvent {
  id: string;
  type: string;
  data: unknown;
  signatureValid: boolean;
}

export class BillingProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "validation" | "not_found" | "unauthorized" | "unavailable" | "unknown",
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "BillingProviderError";
  }
}

export interface CreateCheckoutInput {
  customerId: string;
  customerEmail: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
}

export interface BillingProvider {
  getProviderStatus(): Promise<{ ok: boolean; provider: string; detail?: string }>;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  /** Mock/dev: mark checkout complete and return subscription */
  completeCheckout(sessionId: string): Promise<BillingSubscription>;
  getSubscription(subscriptionId: string): Promise<BillingSubscription>;
  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<BillingSubscription>;
  resumeSubscription(subscriptionId: string): Promise<BillingSubscription>;
  changePlan(subscriptionId: string, planId: string): Promise<BillingSubscription>;
  listInvoices(customerId: string): Promise<Invoice[]>;
  verifyWebhook(payload: string, signature: string | null): Promise<BillingWebhookEvent>;
  /** Simulate payment failure for development */
  simulatePaymentFailed?(subscriptionId: string): Promise<BillingSubscription>;
}

export type BillingProviderKind = "mock" | "stripe";

/** Pure state machine helpers — unit tested */
export function nextLifecycleAfterPayment(
  current: CustomerLifecycle,
): CustomerLifecycle {
  if (current === "lead" || current === "customer" || current === "subscribed") {
    return "subscribed";
  }
  if (current === "grace_period" || current === "suspended") {
    return "active";
  }
  return current === "vpn_provisioned" ? "active" : current;
}

export function nextLifecycleAfterVpnProvisioned(
  current: CustomerLifecycle,
): CustomerLifecycle {
  if (current === "subscribed" || current === "customer") return "vpn_provisioned";
  if (current === "vpn_provisioned") return "active";
  return current;
}

export function nextLifecycleAfterPaymentFailed(
  current: CustomerLifecycle,
): CustomerLifecycle {
  if (current === "active" || current === "vpn_provisioned" || current === "subscribed") {
    return "grace_period";
  }
  if (current === "grace_period") return "suspended";
  return current;
}

export function nextLifecycleAfterCancel(
  current: CustomerLifecycle,
): CustomerLifecycle {
  if (current === "active" || current === "vpn_provisioned" || current === "subscribed" || current === "grace_period") {
    return "cancelled";
  }
  return current;
}

export function canProvisionVpn(lifecycle: CustomerLifecycle, billingStatus: SubscriptionStatus): boolean {
  const billingOk = billingStatus === "active" || billingStatus === "trialing";
  const lifeOk =
    lifecycle === "subscribed" ||
    lifecycle === "vpn_provisioned" ||
    lifecycle === "active" ||
    lifecycle === "customer";
  return billingOk && lifeOk;
}
