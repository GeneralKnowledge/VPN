"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ThemeToggle } from "./theme-toggle";

export function MobileNav({ items, authed }: { items: { href: string; label: string }[]; authed?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sea"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
      </button>
      {open ? (
        <nav
          id={panelId}
          aria-label="Main"
          className="absolute inset-x-0 top-16 border-b border-border bg-background px-4 py-3 shadow-lg"
        >
          <ul className="mx-auto flex max-w-6xl flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="block rounded-md px-3 py-3 text-base text-foreground hover:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-sea"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {!authed ? (
              <li>
                <Link href="/login" className="block rounded-md px-3 py-3 text-base text-foreground hover:bg-surface-2">
                  Log in
                </Link>
              </li>
            ) : null}
            <li className="mt-2 border-t border-border px-3 pt-3 sm:hidden">
              <ThemeToggle />
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
