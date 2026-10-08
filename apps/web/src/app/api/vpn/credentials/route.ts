import { HttpError, handle } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getDb, getVpnProvider } from "@/lib/providers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resetVpnCredentials } from "@/lib/services";
import { correlationId } from "@/lib/utils";

/**
 * Generates a new password for username/password VPN protocols. The value is shown once and never
 * stored in plain text locally, so this is the only way for a customer to learn it.
 */
export async function POST() {
  return handle(
    async () => {
      const user = await requireUser();
      enforceRateLimit("vpn-credentials", [`user:${user.id}`], 5, 60 * 60_000);
      try {
        const creds = await resetVpnCredentials(getDb(), getVpnProvider(), user.id, correlationId());
        return Response.json(creds, { headers: { "Cache-Control": "no-store" } });
      } catch (err) {
        if (err instanceof Error && err.message === "VPN account is not active") {
          throw new HttpError(400, "Your VPN is not ready yet.");
        }
        throw err;
      }
    },
    { kind: "vpn" },
  );
}
