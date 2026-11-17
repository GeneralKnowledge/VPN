"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";
import { Button, FormError, Input, Label, Textarea } from "@/components/ui";
import { safeJson } from "@/lib/client";

export function SaveTripForm({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const value = (key: string) => {
      const v = String(form.get(key) ?? "").trim();
      return v === "" ? null : v;
    };
    let res: Response;
    try {
      res = await fetch("/api/travel/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationSlug: slug,
          startDate: value("startDate"),
          endDate: value("endDate"),
          notes: value("notes"),
        }),
      });
    } catch {
      setSaving(false);
      setError("Network error. Please try again.");
      return;
    }
    if (!res.ok) {
      const data = await safeJson(res);
      setSaving(false);
      setError(data.error ?? "Couldn't save the trip");
      return;
    }
    router.push("/trips");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label={`Save a trip to ${name}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-start`}>From (optional)</Label>
          <Input id={`${id}-start`} name="startDate" type="date" />
        </div>
        <div>
          <Label htmlFor={`${id}-end`}>To (optional)</Label>
          <Input id={`${id}-end`} name="endDate" type="date" />
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-notes`}>Notes (optional)</Label>
        <Textarea id={`${id}-notes`} name="notes" maxLength={2000} placeholder="Booking references, ideas, who's coming" />
      </div>
      <FormError id={`${id}-error`}>{error}</FormError>
      <Button type="submit" disabled={saving} aria-busy={saving}>
        {saving ? "Saving…" : `Save ${name} trip`}
      </Button>
    </form>
  );
}
