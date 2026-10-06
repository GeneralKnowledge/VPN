"use client";

import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";

export function SupportForm({ ticketId }: { ticketId?: string }) {
  const router = useRouter();
  if (ticketId) {
    return (
      <form
        className="mt-4 flex gap-2"
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
        <Input name="body" placeholder="Reply…" required />
        <Button type="submit">Reply</Button>
      </form>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await fetch("/api/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: fd.get("subject"), body: fd.get("body") }),
        });
        router.refresh();
        e.currentTarget.reset();
      }}
    >
      <div>
        <Label htmlFor="subject">New ticket</Label>
        <Input id="subject" name="subject" required placeholder="Subject" />
      </div>
      <textarea
        name="body"
        required
        rows={3}
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
        placeholder="How can we help?"
      />
      <Button type="submit">Create ticket</Button>
    </form>
  );
}
