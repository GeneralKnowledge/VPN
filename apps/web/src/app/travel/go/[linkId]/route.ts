import { followPartnerLink } from "@/lib/partner-links";
import { getDb, getTravelPartners } from "@/lib/providers";

const UNAVAILABLE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not available</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5;color:#1f2937;background:#fff}a{color:#0e7490}@media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#111827}a{color:#67e8f9}}</style>
</head>
<body>
<h1>This link isn't available</h1>
<p>The travel partner behind it may be paused, or the link may be out of date.</p>
<p><a href="/destinations">Back to destinations</a></p>
</body>
</html>`;

/**
 * A referral link (docs/TRAVEL-HUB.md, phase 2): record the click, then send the person to the URL
 * a partner adapter stored under this id. It takes no destination from the request, so it can't be
 * used as an open redirect, and it stores no IP address, user agent or account.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const target = await followPartnerLink(getDb(), getTravelPartners(), linkId);
  if (!target) {
    return new Response(UNAVAILABLE, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
