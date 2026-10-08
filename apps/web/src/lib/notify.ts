import type { EmailProvider, SendEmailInput } from "@northstar/email";

/**
 * Send a transactional email without letting delivery problems break the operation that
 * triggered it (signup, provisioning, billing). Failures are logged for follow-up.
 */
export async function sendEmailSafe(email: EmailProvider, input: SendEmailInput): Promise<boolean> {
  try {
    await email.send(input);
    return true;
  } catch (err) {
    console.error("[email:error]", {
      template: input.template,
      correlationId: input.correlationId,
      message: err instanceof Error ? err.message : "send failed",
    });
    return false;
  }
}
