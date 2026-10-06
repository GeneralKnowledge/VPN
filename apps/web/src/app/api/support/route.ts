import { eq } from "drizzle-orm";
import { supportMessages, supportTickets, users } from "@northstar/db";
import { z } from "zod";
import { getSessionUser, requireUser, writeAudit } from "@/lib/auth";
import { getDb, getEmailProvider } from "@/lib/providers";
import { correlationId, newId } from "@/lib/utils";

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let payload: Record<string, unknown>;
  if (contentType.includes("application/json")) {
    payload = (await req.json()) as Record<string, unknown>;
  } else {
    const fd = await req.formData();
    payload = Object.fromEntries(fd.entries());
  }

  // Public contact form (no auth)
  if (payload.source === "contact") {
    const parsed = z
      .object({
        email: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
        source: z.string(),
      })
      .safeParse(payload);
    if (!parsed.success) return Response.json({ error: "Invalid" }, { status: 400 });
    // Contact form: email ops inbox in mock/production without creating a user record
    await getEmailProvider().send({
      to: process.env.SEED_ADMIN_EMAIL ?? "admin@northstar.local",
      template: "support_response",
      vars: {
        name: "Admin",
        ticketId: "contact",
        message: `From ${parsed.data.email}: ${parsed.data.subject}\n\n${parsed.data.body}`,
      },
      correlationId: correlationId(),
    });
    return Response.redirect(new URL("/contact?sent=1", req.url), 303);
  }

  const user = await requireUser();
  const db = getDb();

  if (typeof payload.ticketId === "string") {
    const body = z.object({ ticketId: z.string(), body: z.string().min(1) }).safeParse(payload);
    if (!body.success) return Response.json({ error: "Invalid" }, { status: 400 });
    const ticket = (
      await db.select().from(supportTickets).where(eq(supportTickets.id, body.data.ticketId)).limit(1)
    )[0];
    if (!ticket || (ticket.userId !== user.id && user.role !== "admin")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    await db.insert(supportMessages).values({
      id: newId("msg"),
      ticketId: ticket.id,
      authorId: user.id,
      body: body.data.body,
      isStaff: user.role === "admin",
    });
    if (user.role === "admin") {
      const owner = (await db.select().from(users).where(eq(users.id, ticket.userId)).limit(1))[0];
      if (owner) {
        await getEmailProvider().send({
          to: owner.email,
          template: "support_response",
          vars: { name: owner.name ?? "there", ticketId: ticket.id, message: body.data.body },
          correlationId: correlationId(),
        });
      }
    }
    return Response.json({ ok: true });
  }

  const body = z.object({ subject: z.string().min(1), body: z.string().min(1) }).safeParse(payload);
  if (!body.success) return Response.json({ error: "Invalid" }, { status: 400 });
  const ticketId = newId("tkt");
  await db.insert(supportTickets).values({
    id: ticketId,
    userId: user.id,
    subject: body.data.subject,
    status: "open",
  });
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
  void getSessionUser;
  return Response.json({ ok: true, id: ticketId });
}
