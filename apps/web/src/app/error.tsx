"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        We hit an unexpected problem. Please try again, and contact support if it keeps happening.
        {error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <div className="flex gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm">
          Go home
        </Link>
      </div>
    </div>
  );
}
