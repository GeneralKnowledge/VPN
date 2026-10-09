import Link from "next/link";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  currentSessionKey,
  listUserSessions,
  requireUser,
} from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Card, PageHeader } from "@/components/ui";
import { AccountActions } from "./account-actions";
import { SessionsPanel } from "./sessions-panel";

export default async function AccountPage() {
  const user = await requireUser();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const currentId = token ? currentSessionKey(token) : null;
  const rows = await listUserSessions(getDb(), user.id);
  const sessionRows = rows
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      current: currentId != null && s.id === currentId,
    }))
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bTime - aTime;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Your profile, security, sessions, and account deletion — all self-serve."
      />
      <Card>
        <p className="text-sm text-muted">Email</p>
        <p className="font-medium">{user.email}</p>
        <p className="mt-4 text-sm text-muted">Name</p>
        <p className="font-medium">{user.name ?? "—"}</p>
        <p className="mt-4 text-sm text-muted">Referral code</p>
        <p className="font-mono font-medium">{user.referralCode}</p>
        <p className="mt-3 text-sm text-muted">
          Share your code on the{" "}
          <Link href="/dashboard/referral" className="text-sea hover:underline">
            Referral
          </Link>{" "}
          page.
        </p>
      </Card>
      <SessionsPanel sessions={sessionRows} />
      <AccountActions />
    </div>
  );
}
