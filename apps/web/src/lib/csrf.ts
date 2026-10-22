/** Methods that change state and therefore need a same-origin check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Cross-site request check for state-changing API calls. SameSite=Lax cookies alone do not cover
 * sibling subdomains (the VPN and eSIM hosts are the same "site"), so a request is refused when the
 * browser says it came from another origin. Requests without browser metadata (webhooks, cron,
 * curl) carry no ambient session cookie risk and pass through to their own auth.
 *
 * `allowedHosts` are the hosts this request may legitimately come from: its own Host (and the
 * forwarded host when trusted), plus the configured public app URLs.
 */
export function isCrossSiteWrite(
  method: string,
  headers: { get(name: string): string | null },
  allowedHosts: Array<string | null | undefined>,
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") return true;

  const origin = headers.get("origin");
  if (!origin) return false;
  // Opaque origins ("null": sandboxed frames, some redirects) are never ours.
  const originHost = hostOf(origin);
  if (!originHost) return true;

  const allowed = new Set(allowedHosts.filter(Boolean).map((h) => h!.toLowerCase()));
  return !allowed.has(originHost);
}

export { hostOf };
