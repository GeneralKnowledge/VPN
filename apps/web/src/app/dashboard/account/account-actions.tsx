"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Label } from "@/components/ui";

export function AccountActions() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-lg">Change password</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/account/password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                currentPassword: fd.get("currentPassword"),
                newPassword: fd.get("newPassword"),
              }),
            });
            const data = await res.json();
            setMsg(res.ok ? "Password updated" : data.error ?? "Failed");
          }}
        >
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" name="currentPassword" type="password" required />
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" name="newPassword" type="password" required minLength={8} />
          </div>
          <Button type="submit">Update password</Button>
        </form>
        {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
      </Card>
      <Card>
        <h2 className="font-display text-lg text-danger">Delete account</h2>
        <p className="mt-2 text-sm text-muted">Soft-deletes your account and revokes access. Confirmation required.</p>
        <Button
          className="mt-4"
          variant="danger"
          type="button"
          onClick={async () => {
            if (!confirm("Delete your account permanently from the app?")) return;
            const res = await fetch("/api/account/delete", { method: "POST" });
            if (res.ok) {
              router.push("/");
              router.refresh();
            }
          }}
        >
          Delete account
        </Button>
      </Card>
    </div>
  );
}
