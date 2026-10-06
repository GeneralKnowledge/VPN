import { referralProgram } from "@northstar/config";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { getReferralLeaderboard, getReferralStats } from "@/lib/referrals";
import { Badge, Card } from "@/components/ui";
import { ReferralShare } from "./share";

export default async function ReferralPage() {
  const user = await requireUser();
  const db = getDb();
  const stats = await getReferralStats(db, user.id);
  const leaderboard = await getReferralLeaderboard(db, { viewerUserId: user.id });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/register?ref=${encodeURIComponent(user.referralCode)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Referrals</h1>
        <p className="mt-1 text-sm text-muted">
          Invite friends. When {stats.required} of them become paying customers, you get{" "}
          {stats.rewardMonths} month{stats.rewardMonths === 1 ? "" : "s"} of Premium free.
        </p>
      </div>

      <Card>
        <p className="text-sm text-muted">Your code</p>
        <p className="mt-2 font-mono text-2xl tracking-wide">{user.referralCode}</p>
        <ReferralShare code={user.referralCode} shareUrl={shareUrl} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Paying referrals</p>
          <p className="mt-1 font-display text-3xl">{stats.paying}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Toward next free month</p>
          <p className="mt-1 font-display text-3xl">
            {stats.towardNext} / {stats.required}
          </p>
          <p className="mt-1 text-xs text-muted">
            {stats.neededForNextReward} more paying friend
            {stats.neededForNextReward === 1 ? "" : "s"} to unlock
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Rewards earned</p>
          <p className="mt-1 font-display text-3xl">
            {Math.floor(stats.rewarded / referralProgram.payingReferralsRequired) *
              referralProgram.rewardMonths}
            <span className="ml-1 text-base text-muted">mo</span>
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sea transition-all"
            style={{
              width: `${Math.min(100, (stats.towardNext / stats.required) * 100)}%`,
            }}
          />
        </div>
        <p className="text-sm text-muted">
          Signed up, not yet paid: {stats.pending}. Stack rewards — every {stats.required} paying
          referrals adds another free month.
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-xl">Leaderboard</h2>
        <p className="mt-1 text-sm text-muted">Top referrers by paying friends. First names only.</p>
        {leaderboard.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No paying referrals yet — be the first.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {leaderboard.map((entry) => (
              <li
                key={`${entry.rank}-${entry.displayName}`}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  entry.isYou ? "bg-sea/10" : "bg-surface-2"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-muted w-6">#{entry.rank}</span>
                  <span className="font-medium">
                    {entry.displayName}
                    {entry.isYou ? (
                      <Badge tone="sea">You</Badge>
                    ) : null}
                  </span>
                </span>
                <span className="text-muted">{entry.payingReferrals} paying</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
