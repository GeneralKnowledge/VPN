"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFeedback } from "@/components/feedback";
import { Button, Card } from "@/components/ui";
import { safeJson } from "@/lib/client";
import { formatDateTime } from "@/lib/format";

export type SessionRow = {
  id: string;
  createdAt: Date | string | number | null;
  expiresAt: Date | string | number | null;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
};

function summariseAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const lower = ua.toLowerCase();
  let os = "Device";
  if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("mac os") || lower.includes("macintosh")) os = "macOS";
  else if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("linux")) os = "Linux";

  let browser = "browser";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("chrome/") && !lower.includes("edg/")) browser = "Chrome";
  else if (lower.includes("safari/") && !lower.includes("chrome")) browser = "Safari";
  else if (lower.includes("firefox/")) browser = "Firefox";

  return `${browser} on ${os}`;
}

export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function revokeOthers() {
    const ok = await confirm({
      title: "Sign out other devices?",
      description: "You’ll stay signed in here. Other browsers and devices will need to sign in again.",
      confirmLabel: "Sign out others",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/sessions?others=1", { method: "DELETE" });
      if (!res.ok) toast((await safeJson(res)).error ?? "Couldn’t sign out other sessions", "danger");
      else toast("Other sessions signed out", "success");
    } catch {
      toast("Network error. Please try again.", "danger");
    }
    setBusy(false);
    router.refresh();
  }

  async function revokeOne(id: string, label: string) {
    const ok = await confirm({
      title: `Sign out ${label}?`,
      description: "That device will need to sign in again.",
      confirmLabel: "Sign out",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/account/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) toast((await safeJson(res)).error ?? "Couldn’t sign out that session", "danger");
      else toast("Session signed out", "success");
    } catch {
      toast("Network error. Please try again.", "danger");
    }
    setBusy(false);
    router.refresh();
  }

  const others = sessions.filter((s) => !s.current);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Active sessions</h2>
          <p className="mt-1 text-sm text-muted">Browsers and devices currently signed in to your account.</p>
        </div>
        {others.length > 0 ? (
          <Button size="sm" variant="secondary" type="button" disabled={busy} onClick={revokeOthers}>
            Sign out other devices
          </Button>
        ) : null}
      </div>
      <ul className="mt-4 space-y-3">
        {sessions.map((s) => {
          const label = summariseAgent(s.userAgent);
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium">
                  {label}
                  {s.current ? <span className="ml-2 text-sm font-normal text-sea">This device</span> : null}
                </p>
                <p className="text-sm text-muted">
                  Signed in {formatDateTime(s.createdAt)}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                </p>
              </div>
              {!s.current ? (
                <Button size="sm" variant="danger" type="button" disabled={busy} onClick={() => revokeOne(s.id, label)}>
                  Sign out
                </Button>
              ) : null}
            </li>
          );
        })}
        {sessions.length === 0 ? (
          <li className="text-sm text-muted">No active sessions.</li>
        ) : null}
      </ul>
    </Card>
  );
}
