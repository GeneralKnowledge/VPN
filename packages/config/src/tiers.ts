import { z } from "zod";

/** Trust ↔ anonymity ladder. Higher tiers keep more contact data and get more help. */
export const accessTierSchema = z.enum(["platinum", "diamond", "gold", "bronze", "iron"]);
export type AccessTier = z.infer<typeof accessTierSchema>;

export const identityModeSchema = z.enum(["email", "username"]);
export type IdentityMode = z.infer<typeof identityModeSchema>;

/** Who actually takes the money — we never store card or wallet secrets. */
export const paymentRailSchema = z.enum(["stripe", "crypto"]);
export type PaymentRail = z.infer<typeof paymentRailSchema>;

/**
 * subscription = renews until cancelled (Stripe year/month).
 * prepaid = one-off purchase; access runs until period end, then stops (crypto year, Stripe one-offs).
 */
export const billingModeSchema = z.enum(["subscription", "prepaid"]);
export type BillingMode = z.infer<typeof billingModeSchema>;

export const supportLevelSchema = z.enum(["full", "standard", "basic", "self_serve"]);
export type SupportLevel = z.infer<typeof supportLevelSchema>;

export const tierMeta: Record<
  AccessTier,
  {
    label: string;
    blurb: string;
    identityMode: IdentityMode;
    paymentRail: PaymentRail;
    billingMode: BillingMode;
    supportLevel: SupportLevel;
    /** Honest drawback copy — less data means less help. */
    supportNote: string;
  }
> = {
  platinum: {
    label: "Platinum",
    blurb: "Email account, Stripe subscription, full email support.",
    identityMode: "email",
    paymentRail: "stripe",
    billingMode: "subscription",
    supportLevel: "full",
    supportNote: "Password reset by email and full ticket support.",
  },
  diamond: {
    label: "Diamond",
    blurb: "Username only, Stripe subscription — middle ground for privacy.",
    identityMode: "username",
    paymentRail: "stripe",
    billingMode: "subscription",
    supportLevel: "standard",
    supportNote: "No email on file: no password reset by mail. Ticket support only.",
  },
  gold: {
    label: "Gold",
    blurb: "Stripe prepaid (one-off). Pays for a period; does not auto-renew.",
    identityMode: "email",
    paymentRail: "stripe",
    billingMode: "prepaid",
    supportLevel: "standard",
    supportNote: "Email on file for receipts and resets. Prepaid — buy again when it ends.",
  },
  bronze: {
    label: "Bronze",
    blurb: "Email account, crypto prepaid. We never see wallet keys.",
    identityMode: "email",
    paymentRail: "crypto",
    billingMode: "prepaid",
    supportLevel: "basic",
    supportNote: "Basic ticket help. Crypto payments are final once confirmed.",
  },
  iron: {
    label: "Iron",
    blurb: "Username + crypto prepaid. Minimal data, self-serve only.",
    identityMode: "username",
    paymentRail: "crypto",
    billingMode: "prepaid",
    supportLevel: "self_serve",
    supportNote: "No email, no tickets. Guides and dashboard only — keep your username safe.",
  },
};

/** Max new support tickets per hour by support level. */
export const supportTicketLimitPerHour: Record<SupportLevel, number> = {
  full: 20,
  standard: 10,
  basic: 3,
  self_serve: 0,
};

export function tierRequiresEmail(tier: AccessTier): boolean {
  return tierMeta[tier].identityMode === "email";
}

export function tierAllowsPasswordResetEmail(tier: AccessTier | null): boolean {
  if (!tier) return true;
  return tierMeta[tier].identityMode === "email";
}
