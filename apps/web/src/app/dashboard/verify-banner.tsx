"use client";

import { useState } from "react";
import { safeJson } from "@/lib/client";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="border-b border-border bg-warning px-4 py-2 text-sm text-warning-foreground" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 sm:px-2">
        <span>Verify your email ({email}) to subscribe and secure your account.</span>
        <button
          type="button"
          className="font-medium underline disabled:opacity-50"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch("/api/auth/resend-verification", { method: "POST" });
              const data = await safeJson(res);
              setMsg(res.ok ? "Verification email sent." : (data.error ?? "Couldn’t send. Try again later."));
            } catch {
              setMsg("Network error. Please try again.");
            }
            setLoading(false);
          }}
        >
          Resend email
        </button>
        {msg ? <span>{msg}</span> : null}
      </div>
    </div>
  );
}
