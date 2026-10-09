"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { safeJson } from "@/lib/client";

async function send(payload: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return null;
    return (await safeJson(res)).error ?? "We couldn’t send that. Please try again.";
  } catch {
    return "Network error. Please try again.";
  }
}

export function SupportForm({ ticketId }: { ticketId?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (ticketId) {
    return (
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const failure = await send({ ticketId, body: fd.get("body") });
          setError(failure);
          if (!failure) {
            form.reset();
            router.refresh();
          }
        }}
      >
        <Input name="body" placeholder="Reply…" required maxLength={5000} />
        <Button type="submit">Reply</Button>
        {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
      </form>
    );
  }
  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const failure = await send({ subject: fd.get("subject"), body: fd.get("body") });
        setError(failure);
        if (!failure) {
          form.reset();
          router.refresh();
        }
      }}
    >
      <div>
        <Label htmlFor="subject">New ticket</Label>
        <Input id="subject" name="subject" required maxLength={200} placeholder="Subject" />
      </div>
      <Textarea
        name="body"
        required
        rows={3}
        maxLength={5000}
        aria-label="Message"
        placeholder="How can we help?"
      />
      <Button type="submit">Create ticket</Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
