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
  // "cancelling" is paid through the end of the period, so access (and repair of it) continues.
  const billingOk = billingStatus === "active" || billingStatus === "trialing" || billingStatus === "cancelling";
  const lifeOk =
    lifecycle === "subscribed" ||
    lifecycle === "vpn_provisioned" ||
    lifecycle === "active" ||
    lifecycle === "customer" ||
    (lifecycle === "cancelled" && billingStatus === "cancelling");
  return billingOk && lifeOk;
}

/** Statuses that count as the user's current subscription (mirrors the DB unique index). */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "active",
  "trialing",
  "cancelling",
  "past_due",
];

export function isLiveSubscriptionStatus(status: string): boolean {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/** Resuming a subscription that was set to cancel puts the customer back in a paying lifecycle. */
export function nextLifecycleAfterResume(
  current: CustomerLifecycle,
  vpnActive: boolean,
): CustomerLifecycle {
  if (current !== "cancelled") return current;
  return vpnActive ? "active" : "subscribed";
}

/** Subscriptions stay usable for a short grace window after a missed renewal before access is cut. */
export const RENEWAL_GRACE_DAYS = 3;
