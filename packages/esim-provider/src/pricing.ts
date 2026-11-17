/** Currencies ResellPortal may quote wholesale prices in. Its balance endpoint reports USD. */
export type WholesaleCurrency = "USD" | "GBP";

export interface RetailPricing {
  /** Currency of the supplier's package prices. */
  wholesaleCurrency: WholesaleCurrency;
  /** GBP per 1 USD. Required when wholesaleCurrency is USD. */
  usdToGbp?: number;
  /** Retail = wholesale (in GBP) × markup. 1.4 means 40% on top of cost, before card fees. */
  markup: number;
  /** Floor for any retail price, in pence. */
  minPricePence: number;
}

export const DEFAULT_PRICING: Omit<RetailPricing, "usdToGbp"> = {
  wholesaleCurrency: "USD",
  markup: 1.4,
  minPricePence: 99,
};

export function validatePricing(p: RetailPricing): string[] {
  const problems: string[] = [];
  if (p.wholesaleCurrency === "USD" && !(typeof p.usdToGbp === "number" && p.usdToGbp > 0 && p.usdToGbp < 10)) {
    problems.push("A USD→GBP rate (ESIM_USD_TO_GBP) is required when wholesale prices are in USD");
  }
  if (!(p.markup >= 1 && p.markup <= 10)) problems.push("ESIM_MARKUP must be between 1 and 10");
  if (!(Number.isInteger(p.minPricePence) && p.minPricePence >= 0)) {
    problems.push("ESIM_MIN_PRICE_PENCE must be a whole number of pence");
  }
  return problems;
}

/** Supplier cost converted to GBP pence, or null when it can't be priced. */
export function wholesaleCostPence(amount: number, p: RetailPricing): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const gbp = p.wholesaleCurrency === "GBP" ? amount : amount * (p.usdToGbp ?? Number.NaN);
  if (!Number.isFinite(gbp)) return null;
  return gbp * 100;
}

/**
 * Retail price in GBP pence: wholesale converted to GBP, times the markup, rounded UP so rounding
 * never eats margin, and never below the floor. Null for a package without a usable price, which
 * is then not offered (selling it at a guessed price could lose money).
 */
export function retailPricePence(amount: number, p: RetailPricing): number | null {
  const cost = wholesaleCostPence(amount, p);
  if (cost == null) return null;
  return Math.max(p.minPricePence, Math.ceil(cost * p.markup - 1e-9));
}
