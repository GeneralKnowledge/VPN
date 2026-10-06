import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LogoutButton } from "./logout-button";

const customerNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/vpn", label: "VPN" },
  { href: "/dashboard/locations", label: "Locations" },
  { href: "/dashboard/devices", label: "Devices" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/account", label: "Account" },
  { href: "/dashboard/support", label: "Support" },
  { href: "/dashboard/referral", label: "Referral" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:w-48 lg:flex-col lg:overflow-visible">
          {customerNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
