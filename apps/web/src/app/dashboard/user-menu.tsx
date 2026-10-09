"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export function UserMenu({ email, name }: { email: string; name?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = (name || email).trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  const itemClass = "block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sea"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sea text-xs font-semibold text-white" aria-hidden>
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{name || email}</span>
        <span className="sr-only sm:hidden">Account menu</span>
      </button>
      {open ? (
        <div
          id={menuId}
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          <p className="truncate px-3 py-2 text-xs text-muted">{email}</p>
          <Link href="/dashboard/account" className={itemClass} onClick={() => setOpen(false)}>
            Account
          </Link>
          <Link href="/dashboard/billing" className={itemClass} onClick={() => setOpen(false)}>
            Billing
          </Link>
          <Link href="/dashboard/support" className={itemClass} onClick={() => setOpen(false)}>
            Support
          </Link>
          <button type="button" className={`${itemClass} text-danger`} onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
