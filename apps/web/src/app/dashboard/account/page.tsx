import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { AccountActions } from "./account-actions";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Your profile, security, and account deletion — all self-serve."
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
      <AccountActions />
    </div>
  );
}
