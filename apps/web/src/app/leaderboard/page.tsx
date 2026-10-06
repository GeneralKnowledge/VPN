import Link from "next/link";
import { referralProgram } from "@northstar/config";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/providers";
import { getReferralLeaderboard } from "@/lib/referrals";
import { MarketingPage } from "@/components/marketing-page";
import { Badge, Button } from "@/components/ui";

export const metadata = { title: "Referral leaderboard" };

export default async function LeaderboardPage() {
  const user = await getSessionUser();
  const leaderboard = await getReferralLeaderboard(getDb(), {
    viewerUserId: user?.id,
  });

  return (
    <MarketingPage
      title="Referral leaderboard"
      description={`Invite friends to Northstar. Every ${referralProgram.payingReferralsRequired} paying referrals earns you ${referralProgram.rewardMonths} free month of Premium.`}
    >
      <div className="mb-8 flex flex-wrap gap-3">
        <Link href={user ? "/dashboard/referral" : "/register"}>
          <Button>{user ? "Your referral hub" : "Get your code"}</Button>
        </Link>
        <Link href="/pricing">
          <Button variant="secondary">View pricing</Button>
        </Link>
      </div>

      {leaderboard.length === 0 ? (
        <p className="text-muted">No paying referrals yet. Share your code after you sign up.</p>
      ) : (
        <ol className="max-w-xl space-y-2">
          {leaderboard.map((entry) => (
            <li
              key={`${entry.rank}-${entry.displayName}`}
              className={`flex items-center justify-between rounded-xl border border-border px-4 py-3 ${
                entry.isYou ? "bg-sea/10" : "bg-surface"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-muted">#{entry.rank}</span>
                <span className="font-medium">
                  {entry.displayName}{" "}
                  {entry.isYou ? <Badge tone="sea">You</Badge> : null}
                </span>
              </span>
              <span className="text-sm text-muted">{entry.payingReferrals} paying</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-6 text-xs text-muted">
        Leaderboard shows first names only. Rankings count friends who completed a paid subscription.
      </p>
    </MarketingPage>
  );
}
