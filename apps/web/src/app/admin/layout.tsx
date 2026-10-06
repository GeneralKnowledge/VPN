import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/app/dashboard/logout-button";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/vpn", label: "VPN Accounts" },
  { href: "/admin/connections", label: "Connections" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/health", label: "System Health" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-md bg-sea/10 px-2 py-0.5 text-xs font-medium text-sea-dark">Admin</span>
          </div>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <nav className="flex gap-2 overflow-x-auto lg:w-52 lg:flex-col">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
