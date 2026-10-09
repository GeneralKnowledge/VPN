import Link from "next/link";
import { and, desc, isNull, like, or } from "drizzle-orm";
import { users } from "@northstar/db";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getDb } from "@/lib/providers";
import { DataTable } from "@/components/data-table";
import { Badge, Input, PageHeader } from "@/components/ui";

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
      <PageHeader title="Customers" description="Search and open customer accounts." />
      <form>
        <Input
          name="q"
          type="search"
          aria-label="Search customers"
          defaultValue={q}
          placeholder="Search email or name"
          className="max-w-md"
        />
      </form>
      <DataTable
        caption="Customers"
        emptyTitle="No customers found"
        emptyDescription={q ? "Try a different search." : "No customer accounts yet."}
        rows={rows}
        rowKey={(u) => u.id}
        columns={[
          {
            key: "email",
            header: "Email",
            cell: (u) => (
              <Link href={`/admin/customers/${u.id}`} className="font-medium hover:underline">
                {u.email}
              </Link>
            ),
          },
          {
            key: "name",
            header: "Name",
            cell: (u) => u.name || "—",
          },
          {
            key: "lifecycle",
            header: "Lifecycle",
            cell: (u) => u.lifecycle,
          },
          {
            key: "role",
            header: "Role",
            cell: (u) => <Badge tone={u.role === "admin" ? "sea" : "neutral"}>{u.role}</Badge>,
          },
          {
            key: "created",
            header: "Created",
            className: "text-muted whitespace-nowrap",
            cell: (u) => formatDate(u.createdAt),
          },
        ]}
      />
    </div>
  );
}
