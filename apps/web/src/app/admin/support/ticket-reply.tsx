"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function AdminTicketReply({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        try {
          const res = await fetch("/api/support", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticketId, body: fd.get("body") }),
          });
          if (!res.ok) {
            setError((await safeJson(res)).error ?? "Reply failed");
            return;
          }
          setError(null);
          form.reset();
          router.refresh();
        } catch {
          setError("Network error. Please try again.");
        }
      }}
    >
      <Input name="body" placeholder="Staff reply" required maxLength={5000} />
      <Button type="submit">Reply</Button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </form>
  );
}
