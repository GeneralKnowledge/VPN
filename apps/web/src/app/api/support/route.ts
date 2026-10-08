import { eq } from "drizzle-orm";
import { supportMessages, supportTickets, users } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { appUrl, getDb, getEmailProvider, getEnv, isProduction } from "@/lib/providers";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { correlationId, newId } from "@/lib/utils";

const subject = z.string().trim().min(1).max(200);
const message = z.string().trim().min(1).max(5000);

const contactSchema = z.object({
  email: z.string().trim().email().max(254),
  subject,
  body: message,
  source: z.literal("contact"),
});
const replySchema = z.object({ ticketId: z.string().min(1).max(100), body: message });
const ticketSchema = z.object({ subject, body: message });

async function readPayload(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) return (await req.json()) as Record<string, unknown>;
    return Object.fromEntries((await req.formData()).entries());
  } catch {
    throw new HttpError(400, "Invalid request");
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    const payload = await readPayload(req);

    // Public contact form (no auth): throttled per sender and per address so it cannot be used
    // to flood the support inbox or to send mail at arbitrary people.
    if (payload.source === "contact") {
      const parsed = contactSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, "Please fill in every field with a valid email address.");
      enforceRateLimit("contact", [`email:${parsed.data.email.toLowerCase()}`, clientIp(req) ? `ip:${clientIp(req)}` : null], 5, 60 * 60_000);
      const env = getEnv();
      await sendEmailSafe(getEmailProvider(), {
        to: env.SUPPORT_INBOX_EMAIL ?? env.SEED_ADMIN_EMAIL,
        template: "support_response",
        vars: {
          name: "Support",
          ticketId: "contact",
          message: `From ${parsed.data.email}: ${parsed.data.subject}\n\n${parsed.data.body}`,
        },
        correlationId: correlationId(),
      });
      return Response.redirect(new URL("/contact?sent=1", isProduction() ? appUrl() : req.url), 303);
    }

    const user = await requireUser();
    enforceRateLimit("support", [`user:${user.id}`], 20, 60 * 60_000);
    const db = getDb();

    if (typeof payload.ticketId === "string") {
      const body = replySchema.safeParse(payload);
      if (!body.success) throw new HttpError(400, "Invalid message");
      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, body.data.ticketId)).limit(1);
      if (!ticket || (ticket.userId !== user.id && user.role !== "admin")) throw new HttpError(404, "Not found");
      await db.insert(supportMessages).values({
        id: newId("msg"),
        ticketId: ticket.id,
        authorId: user.id,
        body: body.data.body,
        isStaff: user.role === "admin",
      });
      if (user.role === "admin") {
        const [owner] = await db.select().from(users).where(eq(users.id, ticket.userId)).limit(1);
        if (owner && !owner.deletedAt) {
          await sendEmailSafe(getEmailProvider(), {
            to: owner.email,
            template: "support_response",
            vars: { name: owner.name ?? "there", ticketId: ticket.id, message: body.data.body },
            correlationId: correlationId(),
          });
        }
      }
      return Response.json({ ok: true });
    }

    const body = ticketSchema.safeParse(payload);
    if (!body.success) throw new HttpError(400, "Please enter a subject and a message.");
    const ticketId = newId("tkt");
    await db.insert(supportTickets).values({ id: ticketId, userId: user.id, subject: body.data.subject, status: "open" });
    await db.insert(supportMessages).values({
      id: newId("msg"),
      ticketId,
      authorId: user.id,
      body: body.data.body,
      isStaff: false,
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "support.ticket_created",
      targetType: "support_ticket",
      targetId: ticketId,
    });
    return Response.json({ ok: true, id: ticketId });
  });
}
