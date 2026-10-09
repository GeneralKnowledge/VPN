"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  exact = false,
  className,
  activeClassName = "bg-surface-2 font-medium text-foreground",
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("whitespace-nowrap rounded-md px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground", className, active && activeClassName)}
    >
      {children}
    </Link>
  );
}
