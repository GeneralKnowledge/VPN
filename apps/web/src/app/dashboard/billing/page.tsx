import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { formatPrice, getPlan, plans } from "@northstar/config";
import { invoices, subscriptions } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb, isProduction } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";
import { BillingActions } from "./billing-actions";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; checkout?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const plan = sub ? getPlan(sub.planId) : undefined;
  const inv = await db.select().from(invoices).where(eq(invoices.userId, user.id)).limit(10);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Billing</h1>
      {params.checkout === "cancel" ? (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">Checkout cancelled.</p>
      ) : null}
      <Card>
        <p className="text-sm text-muted">Current subscription</p>
        {sub && plan ? (
          <>
            <p className="mt-2 font-display text-2xl">{plan.name}</p>
            <p className="text-sm text-muted">
              {formatPrice(plan)} · <Badge tone={sub.status === "active" ? "success" : "warning"}>{sub.status}</Badge>
            </p>
            <BillingActions status={sub.status} />
          </>
        ) : (
          <p className="mt-2 text-muted">No active subscription.</p>
        )}
      </Card>

      {!sub || sub.status === "cancelled" || sub.status === "expired" ? (
        <Card>
          <h2 className="font-display text-xl">Choose a plan</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {plans.filter((p) => p.active).map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{p.name}</p>
                <p className="font-display text-2xl">{formatPrice(p)}</p>
                <BillingActions planId={p.id} prefer={params.plan === p.id} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-display text-lg">Invoices</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {inv.length === 0 ? (
            <li className="text-muted">No invoices yet.</li>
          ) : (
            inv.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>£{(i.amount / 100).toFixed(2)}</span>
                <span className="text-muted">{i.status}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
      {!isProduction() ? (
        <p className="text-sm text-muted">Development: checkout is simulated while the mock billing provider is active.</p>
      ) : null}
      <Link href="/pricing" className="text-sm text-sea hover:underline">
        View public pricing
      </Link>
    </div>
  );
}
