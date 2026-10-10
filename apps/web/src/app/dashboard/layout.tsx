import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { emailVerificationRequired } from "@/lib/providers";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileTabBar } from "./mobile-tab-bar";
import { UserMenu } from "./user-menu";
import { VerifyEmailBanner } from "./verify-banner";

const customerNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/vpn", label: "Devices" },
  { href: "/dashboard/locations", label: "Locations" },
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
    <div className="min-h-dvh bg-background pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <UserMenu email={user.email} name={user.name} />
          </div>
        </div>
      </header>
      <PwaInstallBanner surface="dashboard" />
      {emailVerificationRequired() && !user.emailVerifiedAt ? <VerifyEmailBanner email={user.email} /> : null}
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav aria-label="Dashboard" className="hidden gap-2 lg:flex lg:w-48 lg:flex-col">
          {customerNav.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.href === "/dashboard"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <MobileTabBar />
    </div>
  );
}
