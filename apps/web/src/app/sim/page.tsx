import Link from "next/link";
import { esimBrand } from "@northstar/config";
import { Button } from "@/components/ui";

export default function EsimHomePage() {
  return (
    <>
      <section className="hero-mesh relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="animate-rise max-w-2xl">
            <p className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              {esimBrand.name}
            </p>
            <h1 className="mt-4 text-2xl font-medium text-ink/90 sm:text-3xl">
              Travel data for your phone. No plastic SIM.
            </h1>
            <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
              Pick a destination, pay once, scan a QR code. Your plan installs as an eSIM — ready before you land.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/pricing">
                <Button size="lg">Browse plans</Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="secondary">
                  How it works
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl">Simple by design</h2>
        <p className="mt-2 max-w-2xl text-muted">
          One-time packages. No monthly subscription. Install when you need data abroad.
        </p>
        <ul className="mt-10 grid gap-8 sm:grid-cols-3">
          {[
            {
              title: "Choose a plan",
              body: "Filter by country or region. See data and validity upfront.",
            },
            {
              title: "Pay once",
              body: "Checkout covers that package only. No recurring VPN-style bill.",
            },
            {
              title: "Scan & go",
              body: "Your dashboard shows a QR code and install steps for your phone.",
            },
          ].map((item) => (
            <li key={item.title}>
              <h3 className="font-display text-xl">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
