import Link from "next/link";
import { and, desc, isNull, like, or } from "drizzle-orm";
import { users } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Badge, Card } from "@/components/ui";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const db = getDb();
  const rows = q
    ? await db
        .select()
        .from(users)
        .where(and(isNull(users.deletedAt), or(like(users.email, `%${q}%`), like(users.name, `%${q}%`))))
        .orderBy(desc(users.createdAt))
        .limit(50)
    : await db.select().from(users).where(isNull(users.deletedAt)).orderBy(desc(users.createdAt)).limit(50);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Customers</h1>
      <form>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search email or name"
          className="h-11 w-full max-w-md rounded-md border border-border px-3 text-sm"
        />
      </form>
      <div className="space-y-2">
        {rows.map((u) => (
          <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link href={`/admin/customers/${u.id}`} className="font-medium hover:underline">
                {u.email}
              </Link>
              <p className="text-sm text-muted">
                {u.name} · {u.lifecycle}
              </p>
            </div>
            <Badge tone={u.role === "admin" ? "sea" : "neutral"}>{u.role}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
