import Link from "next/link";
import { esimBrand } from "@northstar/config";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui";

const nav = [
  { href: "/pricing", label: "Plans" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/support", label: "Support" },
];

export function EsimSiteChrome({
  authed,
  children,
}: {
  authed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={esimBrand.name}>
            <Logo brand={esimBrand} />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-muted md:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle compact className="hidden sm:inline-flex" />
            {authed ? (
              <Link href="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
            <MobileNav items={nav} authed={authed} />
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border bg-surface-2">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <Logo brand={esimBrand} />
            <p className="mt-3 text-sm text-muted">{esimBrand.tagline}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <Link href="/pricing">Plans</Link>
              </li>
              <li>
                <Link href="/how-it-works">How it works</Link>
              </li>
              <li>
                <Link href="/support">Support</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
              <li>
                <Link href="/refund">Refunds</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 text-center text-xs text-muted">
          © {new Date().getFullYear()} {esimBrand.legalName}.
        </div>
      </footer>
    </div>
  );
}
