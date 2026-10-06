import { MockBillingProvider } from "./mock";
import { StripeBillingProvider } from "./stripe";
import type { BillingProvider, BillingProviderKind } from "./types";

export function createBillingProvider(
  kind: BillingProviderKind,
  options?: {
    secretKey?: string;
    webhookSecret?: string;
    priceMap?: Record<string, string>;
  },
): BillingProvider {
  if (kind === "mock") {
    // Same shared secret env as Stripe — mock webhooks must not be forgeable.
    return new MockBillingProvider(options?.webhookSecret ?? "");
  }
  return new StripeBillingProvider({
    secretKey: options?.secretKey ?? "",
    webhookSecret: options?.webhookSecret ?? "",
    priceMap: options?.priceMap ?? {},
  });
}

export * from "./types";
export { MockBillingProvider } from "./mock";
export { StripeBillingProvider } from "./stripe";
