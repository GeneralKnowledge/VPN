"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function ReferralShare({ code, shareUrl }: { code: string; shareUrl: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copy(value: string, kind: "code" | "link") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => copy(code, "code")}>
        {copied === "code" ? "Copied code" : "Copy code"}
      </Button>
      <Button type="button" size="sm" onClick={() => copy(shareUrl, "link")}>
        {copied === "link" ? "Copied link" : "Copy invite link"}
      </Button>
    </div>
  );
}
