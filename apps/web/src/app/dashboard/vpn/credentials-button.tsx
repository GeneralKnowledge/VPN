"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

/** For username/password protocols (e.g. OpenVPN). The new password is shown once. */
export function ResetCredentialsButton() {
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="mt-3">
      <Button
        size="sm"
        variant="secondary"
        type="button"
        disabled={loading}
        onClick={async () => {
          if (!confirm("Generate a new VPN password? Any app using the old one will need updating.")) return;
          setLoading(true);
          setError(null);
          try {
            const res = await fetch("/api/vpn/credentials", { method: "POST" });
            const data = await safeJson(res);
            if (!res.ok || !data.username || !data.password) {
              setError(data.error ?? "We couldn’t reset your credentials. Please try again.");
            } else {
              setCreds({ username: data.username, password: data.password });
            }
          } catch {
            setError("Network error. Please try again.");
          }
          setLoading(false);
        }}
      >
        {loading ? "Working…" : "Reset VPN password"}
      </Button>
      {creds ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-sm">
          <p className="text-muted">Copy this now — it won’t be shown again.</p>
          <p className="mt-2 font-mono">Username: {creds.username}</p>
          <p className="font-mono">Password: {creds.password}</p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
