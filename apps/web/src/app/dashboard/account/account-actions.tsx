"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { PasswordInput } from "@/components/password-input";
import { Button, Card, FormError, Label } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function AccountActions() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg">Change password</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const formEl = e.currentTarget;
            const fd = new FormData(formEl);
            setPwBusy(true);
            setPwError(null);
            try {
              const res = await fetch("/api/account/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  currentPassword: fd.get("currentPassword"),
                  newPassword: fd.get("newPassword"),
                }),
              });
              const data = await safeJson(res);
              if (res.ok) {
                formEl.reset();
                toast("Password updated", "success");
              } else {
                setPwError(data.error ?? "We couldn’t update your password. Please try again.");
              }
            } catch {
              setPwError("Network error. Please try again.");
            }
            setPwBusy(false);
          }}
        >
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <PasswordInput id="currentPassword" name="currentPassword" required autoComplete="current-password" />
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <PasswordInput id="newPassword" name="newPassword" required minLength={8} maxLength={128} autoComplete="new-password" aria-describedby="new-password-hint" />
            <p id="new-password-hint" className="mt-1.5 text-xs text-muted">At least 8 characters.</p>
          </div>
          <FormError>{pwError}</FormError>
          <Button type="submit" disabled={pwBusy} aria-busy={pwBusy}>
            {pwBusy ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-display text-lg text-danger">Delete account</h2>
        <p className="mt-2 text-sm text-muted">
          Cancels your subscription, removes your VPN account and signs you out everywhere. This cannot be undone.
        </p>
        {showDelete ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDeleteError(null);
              try {
                const res = await fetch("/api/account/delete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password: fd.get("password") }),
                });
                const data = await safeJson(res);
                if (!res.ok) {
                  setDeleteError(data.error ?? "We couldn’t delete your account. Please try again.");
                  return;
                }
                router.push("/");
                router.refresh();
              } catch {
                setDeleteError("Network error. Please try again.");
              }
            }}
          >
            <div>
              <Label htmlFor="deletePassword">Confirm your password</Label>
              <PasswordInput id="deletePassword" name="password" required autoComplete="current-password" />
            </div>
            <div className="flex gap-2">
              <Button variant="danger" type="submit">
                Permanently delete
              </Button>
              <Button variant="secondary" type="button" onClick={() => setShowDelete(false)}>
                Keep my account
              </Button>
            </div>
            <FormError>{deleteError}</FormError>
          </form>
        ) : (
          <Button className="mt-4" variant="danger" type="button" onClick={() => setShowDelete(true)}>
            Delete account
          </Button>
        )}
      </Card>
    </div>
  );
}
