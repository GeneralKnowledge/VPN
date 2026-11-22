import Link from "next/link";
import { travelBrand } from "@northstar/config";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui";

const baseNav = [
  { href: "/", label: "Explore" },
  { href: "/destinations", label: "Destinations" },
  { href: "/search", label: "Search" },
];

/**
 * Travel host chrome. The footer links to the two products Travel introduces, which keep their
 * own sites and checkout.
 */
export function TravelSiteChrome({
  authed,
  esimUrl,
  vpnUrl,
  children,
}: {
  authed: boolean;
  esimUrl: string;
  vpnUrl: string;
  children: React.ReactNode;
}) {
  const nav = authed ? [...baseNav, { href: "/trips", label: "My trips" }] : baseNav;
  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={travelBrand.name}>
            <Logo brand={travelBrand} />
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
            {authed ? null : (
              <Link href="/login" className="hidden sm:inline">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
            )}
            <MobileNav items={nav} authed={authed} />
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border bg-surface-2">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <Logo brand={travelBrand} />
            <p className="mt-3 text-sm text-muted">{travelBrand.tagline}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Travel</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <Link href="/destinations">Destinations</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Our products</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <a href={esimUrl}>Northstar SIM (travel eSIMs)</a>
              </li>
              <li>
                <a href={vpnUrl}>Northstar VPN</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 text-center text-xs text-muted">
          © {new Date().getFullYear()} {travelBrand.legalName}. Travel information is general guidance:
          check official advice before you travel.
        </div>
      </footer>
    </div>
  );
}
