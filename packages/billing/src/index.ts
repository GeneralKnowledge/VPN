import { CryptoBillingProvider } from "./crypto";
import { MockBillingProvider } from "./mock";
import { StripeBillingProvider } from "./stripe";
import type { BillingProvider, BillingProviderKind, PaymentRail } from "./types";

export function createBillingProvider(
  kind: BillingProviderKind,
  options?: {
    secretKey?: string;
    webhookSecret?: string;
    priceMap?: Record<string, string>;
    /** Used when kind is mock to label the default rail in status. */
    defaultRail?: PaymentRail;
  },
): BillingProvider {
  if (kind === "mock") {
    return new MockBillingProvider(options?.webhookSecret ?? "", options?.defaultRail ?? "stripe");
  }
  if (kind === "crypto") {
    return new CryptoBillingProvider({
      apiKey: options?.secretKey,
      webhookSecret: options?.webhookSecret,
    });
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
export { CryptoBillingProvider } from "./crypto";
