"use client";

import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export function AdminTicketReply({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await fetch("/api/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId, body: fd.get("body") }),
        });
        router.refresh();
        e.currentTarget.reset();
      }}
    >
      <Input name="body" placeholder="Staff reply" required />
      <Button type="submit">Reply</Button>
    </form>
  );
}
