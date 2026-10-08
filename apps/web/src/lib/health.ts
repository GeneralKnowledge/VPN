import { plans } from "@northstar/db";
import { getBillingProvider, getDb, getEmailProvider, getVpnProvider } from "./providers";

export type ProviderStatus = { ok: boolean; provider: string; detail?: string };

export async function checkDatabase(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await getDb().select({ id: plans.id }).from(plans).limit(1);
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "error" };
  }
}

async function safeStatus(name: string, fn: () => Promise<ProviderStatus>): Promise<ProviderStatus> {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, provider: name, detail: err instanceof Error ? err.message : "status check failed" };
  }
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: { vpn: ProviderStatus; billing: ProviderStatus; email: ProviderStatus } } | null = null;

/**
 * Provider status checks can hit external APIs. Cache briefly so unauthenticated health
 * probes cannot be used to hammer (or exhaust the rate limit of) the upstream provider.
 */
export async function getProviderStatuses(options?: { fresh?: boolean }) {
  const now = Date.now();
  if (!options?.fresh && cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  const [vpn, billing, email] = await Promise.all([
    safeStatus("vpn", () => getVpnProvider().getProviderStatus()),
    safeStatus("billing", () => getBillingProvider().getProviderStatus()),
    safeStatus("email", () => getEmailProvider().getProviderStatus()),
  ]);
  cache = { at: now, value: { vpn, billing, email } };
  return cache.value;
}

export function resetProviderStatusCache() {
  cache = null;
}
