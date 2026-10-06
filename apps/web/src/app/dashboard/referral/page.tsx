import { eq } from "drizzle-orm";
import { referrals } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { Card } from "@/components/ui";

export default async function ReferralPage() {
  const user = await requireUser();
  const db = getDb();
  const mine = await db.select().from(referrals).where(eq(referrals.referrerUserId, user.id));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Referral</h1>
      <Card>
        <p className="text-sm text-muted">Your referral code</p>
        <p className="mt-2 font-mono text-2xl">{user.referralCode}</p>
        <p className="mt-3 text-sm text-muted">
          Share this code at signup. Reward payouts are not implemented yet — the data model is ready.
        </p>
      </Card>
      <Card>
        <h2 className="font-display text-lg">Referrals</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {mine.length === 0 ? (
            <li className="text-muted">No referrals yet.</li>
          ) : (
            mine.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>{r.referredUserId}</span>
                <span className="text-muted">{r.status}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
