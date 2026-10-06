import { desc, eq } from "drizzle-orm";
import { supportMessages, supportTickets, users } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";
import { AdminTicketReply } from "./ticket-reply";

export default async function AdminSupportPage() {
  await requireAdmin();
  const db = getDb();
  const tickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(50);
  const enriched = await Promise.all(
    tickets.map(async (t) => {
      const [owner] = await db.select().from(users).where(eq(users.id, t.userId)).limit(1);
      const messages = await db.select().from(supportMessages).where(eq(supportMessages.ticketId, t.id));
      return { ...t, owner, messages };
    }),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Support</h1>
      {enriched.map((t) => (
        <Card key={t.id}>
          <div className="flex justify-between gap-2">
            <div>
              <p className="font-medium">{t.subject}</p>
              <p className="text-sm text-muted">{t.owner?.email}</p>
            </div>
            <Badge>{t.status}</Badge>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {t.messages.map((m) => (
              <li key={m.id}>{m.isStaff ? "Staff" : "Customer"}: {m.body}</li>
            ))}
          </ul>
          <AdminTicketReply ticketId={t.id} />
        </Card>
      ))}
    </div>
  );
}
