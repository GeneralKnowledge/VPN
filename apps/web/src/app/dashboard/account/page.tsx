import { requireUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import { AccountActions } from "./account-actions";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Account</h1>
      <Card>
        <p className="text-sm text-muted">Email</p>
        <p className="font-medium">{user.email}</p>
        <p className="mt-4 text-sm text-muted">Name</p>
        <p className="font-medium">{user.name ?? "—"}</p>
        <p className="mt-4 text-sm text-muted">Lifecycle</p>
        <p className="font-medium">{user.lifecycle}</p>
        <p className="mt-4 text-sm text-muted">Referral code</p>
        <p className="font-mono font-medium">{user.referralCode}</p>
      </Card>
      <AccountActions />
    </div>
  );
}
