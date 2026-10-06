import { desc, eq } from "drizzle-orm";
import { supportMessages, supportTickets } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";
import { SupportForm } from "./support-form";
import { SupportWithChecklist } from "./checklist";

export default async function SupportDashPage() {
  const user = await requireUser();
  const db = getDb();
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, user.id))
    .orderBy(desc(supportTickets.createdAt));

  const withMessages = await Promise.all(
    tickets.map(async (t) => ({
      ...t,
      messages: await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.ticketId, t.id))
        .orderBy(supportMessages.createdAt),
    })),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Support</h1>
      <SupportWithChecklist />
      <div className="space-y-4">
        {withMessages.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{t.subject}</h2>
              <Badge>{t.status}</Badge>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {t.messages.map((m) => (
                <li key={m.id}>
                  <span className="font-medium text-foreground">{m.isStaff ? "Support" : "You"}:</span>{" "}
                  {m.body}
                </li>
              ))}
            </ul>
            <SupportForm ticketId={t.id} />
          </Card>
        ))}
      </div>
    </div>
  );
}
