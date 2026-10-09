import { eq } from "drizzle-orm";
import { referrals } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function ReferralPage() {
  const user = await requireUser();
  const db = getDb();
  const mine = await db.select().from(referrals).where(eq(referrals.referrerUserId, user.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral"
        description="Share your code when friends sign up. Rewards will appear here when they are enabled."
      />
      <Card>
        <p className="text-sm text-muted">Your referral code</p>
        <p className="mt-2 font-mono text-2xl">{user.referralCode}</p>
        <p className="mt-3 text-sm text-muted">
          Friends can enter this code during registration. Credit and reward rules will be announced before launch.
        </p>
      </Card>
      <Card>
        <h2 className="font-display text-lg">People you’ve referred</h2>
        {mine.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No referrals yet" description="Share your code to see signups listed here." />
          </div>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {mine.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span className="font-mono text-xs text-muted">{r.referredUserId.slice(0, 12)}…</span>
                <span className="text-muted">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
