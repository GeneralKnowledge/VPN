import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingProviderError } from "./types";

/** Stripe's default tolerance for the signed timestamp: replays older than this are refused. */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies a `Stripe-Signature` header the way the Stripe SDK does: HMAC-SHA256 over
 * `${timestamp}.${payload}` with the endpoint secret, compared in constant time against every
 * `v1` signature in the header, with a timestamp tolerance against replays.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  options?: { toleranceSeconds?: number; nowSeconds?: number },
): boolean {
  if (!header || !secret) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signatures.push(value);
  }
  if (timestamp == null || !Number.isFinite(timestamp) || signatures.length === 0) return false;

  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options?.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const given = Buffer.from(sig, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Builds a header Stripe would send; used by tests and local webhook replays. */
export function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export interface OneTimeCheckoutInput {
  /** Our order id; stored as client_reference_id and metadata.orderId. */
  orderId: string;
  /** Minor units (pence). Always computed server-side from the package, never from the browser. */
  amount: number;
  currency: string;
  productName: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Sent as Stripe's Idempotency-Key so a retried create returns the same session. */
  idempotencyKey: string;
  /** What the order is for, so the webhook can route it (for example "esim"). */
  kind: string;
  /** Session lifetime; Stripe accepts 30 minutes to 24 hours. */
  expiresInSeconds?: number;
}

export interface OneTimeCheckoutSession {
  id: string;
  url: string;
}

export interface CheckoutSessionState {
  id: string;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  orderId: string | null;
}

export interface RefundResult {
  id: string;
  status: string;
}

/** One-time payments (Checkout in payment mode plus refunds). */
export interface OneTimePayments {
  readonly provider: "mock" | "stripe";
  createOneTimeCheckout(input: OneTimeCheckoutInput): Promise<OneTimeCheckoutSession>;
  getCheckoutSession(sessionId: string): Promise<CheckoutSessionState | null>;
  refund(paymentIntentId: string, idempotencyKey: string): Promise<RefundResult>;
}

/** Turns a nested object into Stripe's form encoding (`a[b][0][c]=v`). */
export function toStripeForm(value: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    } else if (typeof v === "object") {
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
        walk(prefix ? `${prefix}[${k}]` : k, inner);
      }
    } else {
      params.append(prefix, String(v));
    }
  };
  walk("", value);
  return params;
}

/**
 * Stripe REST calls for one-time payments, with no SDK dependency. Test-mode keys (`sk_test_`)
 * work against the same endpoints; live keys are refused unless `allowLiveKeys` is set, so a
 * live key pasted early cannot take real money before launch.
 */
export class StripeOneTimePayments implements OneTimePayments {
  readonly provider = "stripe" as const;
  private readonly fetchFn: typeof fetch;
  private readonly apiBase: string;

  constructor(
    private readonly config: {
      secretKey: string;
      allowLiveKeys?: boolean;
      fetchFn?: typeof fetch;
      apiBase?: string;
    },
  ) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.apiBase = (config.apiBase ?? "https://api.stripe.com/v1").replace(/\/$/, "");
  }

  private ensureUsable() {
    const key = this.config.secretKey;
    if (!key) throw new BillingProviderError("Missing STRIPE_SECRET_KEY", "unauthorized");
    if (/^(sk|rk)_live_/.test(key) && !this.config.allowLiveKeys) {
      throw new BillingProviderError(
        "Live Stripe keys are refused until STRIPE_ALLOW_LIVE_PAYMENTS=true (launch gate)",
        "unauthorized",
      );
    }
  }

  async createOneTimeCheckout(input: OneTimeCheckoutInput): Promise<OneTimeCheckoutSession> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BillingProviderError("Amount must be a positive integer in minor units", "validation");
    }
    const expiresIn = Math.min(Math.max(input.expiresInSeconds ?? 3600, 1800), 86400);
    const body = toStripeForm({
      mode: "payment",
      client_reference_id: input.orderId,
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amount,
            product_data: { name: input.productName },
          },
        },
      ],
      metadata: { kind: input.kind, orderId: input.orderId },
      payment_intent_data: { metadata: { kind: input.kind, orderId: input.orderId } },
    });
    const session = await this.request<{ id?: string; url?: string }>(
      "POST",
      "/checkout/sessions",
      body,
      input.idempotencyKey,
    );
    if (!session.id || !session.url) {
      throw new BillingProviderError("Stripe returned a session without an id or url", "unknown", true);
    }
    return { id: session.id, url: session.url };
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSessionState | null> {
    try {
      const s = await this.request<Record<string, unknown>>(
        "GET",
        `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      );
      return parseCheckoutSession(s);
    } catch (err) {
      if (err instanceof BillingProviderError && err.code === "not_found") return null;
      throw err;
    }
  }

  async refund(paymentIntentId: string, idempotencyKey: string): Promise<RefundResult> {
    const r = await this.request<{ id?: string; status?: string }>(
      "POST",
      "/refunds",
      toStripeForm({ payment_intent: paymentIntentId }),
      idempotencyKey,
    );
    return { id: r.id ?? "unknown", status: r.status ?? "unknown" };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<T> {
    this.ensureUsable();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.secretKey}`,
    };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let res: Response;
    try {
      res = await this.fetchFn(`${this.apiBase}${path}`, { method, headers, body: body?.toString() });
    } catch (err) {
      throw new BillingProviderError(
        `Stripe unreachable: ${err instanceof Error ? err.message : "network error"}`,
        "unavailable",
        true,
      );
    }
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!res.ok) {
      const message = json.error?.message ?? `Stripe HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new BillingProviderError(message, "unauthorized");
      if (res.status === 404) throw new BillingProviderError(message, "not_found");
      if (res.status === 400 || res.status === 402) throw new BillingProviderError(message, "validation");
      throw new BillingProviderError(message, "unavailable", res.status >= 500 || res.status === 429);
    }
    return json;
  }
}

/** Reads the fields we rely on from a Stripe Checkout Session object (webhook or API). */
export function parseCheckoutSession(s: Record<string, unknown>): CheckoutSessionState {
  const metadata = (s.metadata ?? {}) as Record<string, unknown>;
  const pi = s.payment_intent;
  const paymentIntentId =
    typeof pi === "string" ? pi : pi && typeof pi === "object" ? String((pi as { id?: unknown }).id ?? "") || null : null;
  const status = s.status === "complete" || s.status === "expired" ? s.status : "open";
  const paymentStatus =
    s.payment_status === "paid" || s.payment_status === "no_payment_required" ? s.payment_status : "unpaid";
  return {
    id: String(s.id ?? ""),
    status,
    paymentStatus,
    paymentIntentId,
    amountTotal: typeof s.amount_total === "number" ? s.amount_total : null,
    currency: typeof s.currency === "string" ? s.currency : null,
    orderId:
      typeof metadata.orderId === "string"
        ? metadata.orderId
        : typeof s.client_reference_id === "string"
          ? s.client_reference_id
          : null,
  };
}

/** Mock one-time payments: the in-app mock checkout page stands in for Stripe. */
export class MockOneTimePayments implements OneTimePayments {
  readonly provider = "mock" as const;
  readonly refunds: Array<{ paymentIntentId: string; idempotencyKey: string }> = [];

  async createOneTimeCheckout(input: OneTimeCheckoutInput): Promise<OneTimeCheckoutSession> {
    const id = `esim_chk_${input.orderId}`;
    return { id, url: `/billing/mock-esim-checkout?session_id=${encodeURIComponent(id)}` };
  }

  async getCheckoutSession(): Promise<CheckoutSessionState | null> {
    return null;
  }

  async refund(paymentIntentId: string, idempotencyKey: string): Promise<RefundResult> {
    const existing = this.refunds.find((r) => r.idempotencyKey === idempotencyKey);
    if (!existing) this.refunds.push({ paymentIntentId, idempotencyKey });
    return { id: `re_mock_${idempotencyKey}`, status: "succeeded" };
  }
}
