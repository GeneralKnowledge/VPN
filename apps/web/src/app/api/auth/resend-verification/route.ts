import { createVerificationToken, requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { appUrl, getDb, getEmailProvider } from "@/lib/providers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { correlationId } from "@/lib/utils";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    if (user.emailVerifiedAt) return Response.json({ ok: true, alreadyVerified: true });
    enforceRateLimit("resend-verify", [`user:${user.id}`], 3, 15 * 60_000);
    const token = await createVerificationToken(getDb(), user.id, "email_verify");
    await sendEmailSafe(getEmailProvider(), {
      to: user.email,
      template: "verify_email",
      vars: { name: user.name ?? "there", link: `${appUrl()}/verify-email?token=${token}` },
      correlationId: correlationId(),
    });
    return Response.json({ ok: true });
  });
}
