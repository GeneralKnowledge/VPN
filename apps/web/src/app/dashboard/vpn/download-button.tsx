"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function DownloadConfigButton({ connectionId }: { connectionId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        type="button"
        onClick={async () => {
          const res = await fetch("/api/vpn/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId }),
          });
          if (!res.ok) {
            setMsg("Download failed");
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "northstar-mock.conf";
          a.click();
          URL.revokeObjectURL(url);
          setMsg(res.headers.get("X-Northstar-Mock-Config") === "true" ? "Mock config" : "Downloaded");
        }}
      >
        Download config
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}
