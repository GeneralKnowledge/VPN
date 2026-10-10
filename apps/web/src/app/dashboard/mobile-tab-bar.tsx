"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { LayoutDashboard, MapPin, MoreHorizontal, Smartphone, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const primaryTabs = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/setup", label: "Setup", icon: Sparkles, exact: false },
  { href: "/dashboard/locations", label: "Locations", icon: MapPin, exact: false },
  { href: "/dashboard/vpn", label: "Devices", icon: Smartphone, exact: false },
] as const;

const moreLinks = [
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/account", label: "Account" },
  { href: "/dashboard/support", label: "Support" },
  { href: "/dashboard/referral", label: "Referral" },
] as const;

function pathActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar for mobile / installed PWA — primary VPN actions at thumb reach. */
export function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetId = useId();
  const moreActive = moreLinks.some((l) => pathActive(pathname, l.href, false));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-50 mx-3 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            <ul className="py-2">
              {moreLinks.map((link) => {
                const active = pathActive(pathname, link.href, false);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block px-4 py-3 text-sm",
                        active ? "bg-surface-2 font-medium text-foreground" : "text-foreground hover:bg-surface-2",
                      )}
                      onClick={() => setMoreOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-6">
          {primaryTabs.map((tab) => {
            const active = pathActive(pathname, tab.href, tab.exact);
            const Icon = tab.icon;
            return (
              <li key={tab.href} className="min-w-0">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                    active ? "text-sea" : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                  <span className="truncate">{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-controls={sheetId}
              onClick={() => setMoreOpen((v) => !v)}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                moreOpen || moreActive ? "text-sea" : "text-muted hover:text-foreground",
              )}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden strokeWidth={moreOpen || moreActive ? 2.25 : 1.75} />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
