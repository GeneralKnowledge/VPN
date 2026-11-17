"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function DeleteTripButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Delete ${name} trip`}>
        Delete
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          await fetch(`/api/travel/trips/${encodeURIComponent(id)}`, { method: "DELETE" });
          router.refresh();
        }}
      >
        Delete {name} trip
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </div>
  );
}
