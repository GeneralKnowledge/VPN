"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function DownloadConfigButton({ connectionId }: { connectionId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        type="button"
        onClick={async () => {
          try {
            const res = await fetch("/api/vpn/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ connectionId }),
            });
            if (!res.ok) {
              setMsg((await safeJson(res)).error ?? "Download failed");
              return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download =
              res.headers.get("Content-Disposition")?.split("filename=")[1]?.replaceAll('"', "") ?? "northstar.conf";
            a.click();
            URL.revokeObjectURL(url);
            setMsg(res.headers.get("X-Northstar-Mock-Config") === "true" ? "Mock config" : "Downloaded");
          } catch {
            setMsg("Network error. Please try again.");
          }
        }}
      >
        Download config
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}
