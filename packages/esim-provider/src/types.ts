import { z } from "zod";

export const esimPackageSchema = z.object({
  code: z.string(),
  name: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  dataVolume: z.string(),
  validity: z.string(),
  /** Wholesale-ish retail price in minor units (pence) for mock; live API may override. */
  price: z.number().int().nonnegative(),
  currency: z.literal("GBP"),
});

export type EsimPackage = z.infer<typeof esimPackageSchema>;

export type EsimProfileStatus = "available" | "installed" | "expired" | "unknown";

export interface EsimIssueResult {
  providerOrderId: string;
  packageCode: string;
  packageName: string;
  iccid?: string | null;
  qrCodeUrl?: string | null;
  activationUrl?: string | null;
  status: EsimProfileStatus;
}

export interface CreateEsimOrderInput {
  /** Our stable client reference (user id or order id). */
  clientRef: string;
  email: string;
  packageCode: string;
  firstName?: string;
  lastName?: string;
}

export type EsimProviderErrorCode =
  | "unauthorized"
  | "not_found"
  | "validation"
  | "insufficient_balance"
  | "timeout"
  | "unavailable"
  | "conflict"
  | "rate_limited"
  | "unknown";

export class EsimProviderError extends Error {
  constructor(
    message: string,
    public readonly code: EsimProviderErrorCode,
    public readonly retryable = false,
    public readonly cause?: unknown,
    public readonly httpStatus?: number,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = "EsimProviderError";
  }
}

/**
 * Application-facing eSIM infrastructure contract.
 * Implementations: MockEsimProvider, ResellPortalEsimProvider.
 */
export interface EsimProvider {
  getProviderStatus(): Promise<{ ok: boolean; provider: string; detail?: string }>;
  listPackages(filter?: { country?: string }): Promise<EsimPackage[]>;
  getPackage(packageCode: string): Promise<EsimPackage | null>;
  createOrder(input: CreateEsimOrderInput): Promise<EsimIssueResult>;
  getOrder(providerOrderId: string): Promise<EsimIssueResult | null>;
}

/**
 * What a failed createOrder tells us about the wholesale side. ResellPortal has no idempotency
 * key, so a call that may have reached it (timeout, dropped connection, 5xx) must never be retried
 * blindly: a retry can issue and pay for a second eSIM.
 * - `not_created`: the provider refused before ordering; retrying later is safe.
 * - `rejected`: refused for a reason a retry will not fix (bad package, bad request).
 * - `unknown`: the order may exist; a person must check the ResellPortal panel.
 */
export type EsimIssueOutcome = "not_created" | "rejected" | "unknown";

export function classifyIssueError(err: unknown): EsimIssueOutcome {
  if (!(err instanceof EsimProviderError)) return "unknown";
  switch (err.code) {
    case "unauthorized":
    case "insufficient_balance":
    case "rate_limited":
      return "not_created";
    case "validation":
    case "not_found":
      // A failure before the order call (for example creating the client) is also a refusal.
      return "rejected";
    default:
      return "unknown";
  }
}

export type EsimProviderKind = "mock" | "resellportal";

export const CUSTOMER_ESIM_ERROR =
  "We couldn’t complete that eSIM order. Please try again.";

export const CUSTOMER_ESIM_ISSUE_ERROR =
  "Payment succeeded but we couldn’t issue your eSIM yet. We’ll retry shortly.";
