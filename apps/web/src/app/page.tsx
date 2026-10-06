import Link from "next/link";
import { brand, formatPrice, plans } from "@northstar/config";
import { getSessionUser } from "@/lib/auth";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui";

const faqs = [
  {
    q: "What devices can I use?",
    a: "You can connect using standard WireGuard or OpenVPN clients on Windows, macOS, Linux, iOS, and Android. Native branded apps can be added later when available.",
  },
  {
    q: "Do you keep connection logs?",
    a: "Logging policy depends on our infrastructure provider agreement and will be stated clearly in the Privacy Policy before launch. We do not invent a no-logs claim here.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Manage or cancel your subscription from the billing section of your account dashboard.",
  },
  {
    q: "Are the listed locations live production servers?",
    a: "Marketing and development fixtures show example locations. Live inventory comes from the configured VPN provider when you switch off mock mode.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  const monthly = plans.find((p) => p.id === "premium-monthly")!;
  const annual = plans.find((p) => p.id === "premium-annual")!;

  return (
    <div>
      <SiteHeader authed={Boolean(user)} />
      <main>
        <section className="hero-mesh relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
            <div className="animate-rise">
              <p className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
                {brand.name}
              </p>
              <h1 className="mt-4 max-w-xl text-2xl font-medium text-ink/90 sm:text-3xl">
                Private internet access for everyday devices.
              </h1>
              <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
                Encrypt your connection, choose a location, and get on with your day — without
                unverifiable marketing claims.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register">
                  <Button size="lg">Start with {formatPrice(monthly)}</Button>
                </Link>
                <Link href="/how-it-works">
                  <Button size="lg" variant="secondary">
                    How it works
                  </Button>
                </Link>
              </div>
            </div>
            <div className="animate-rise-delay relative min-h-[280px] lg:min-h-[360px]">
              <div className="animate-drift absolute inset-0 rounded-[2rem] border border-border/60 bg-surface/70 p-6 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>Connection</span>
                  <span className="text-success">Ready</span>
                </div>
                <p className="mt-8 font-display text-3xl text-foreground">United Kingdom</p>
                <p className="text-muted">London · WireGuard</p>
                <div className="mt-10 h-2 overflow-hidden rounded-full bg-mist">
                  <div className="animate-pulse-soft h-full w-2/3 rounded-full bg-sea" />
                </div>
                <p className="mt-4 font-mono text-xs text-muted">
                  Example UI — location inventory is provider-driven
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl">Why {brand.shortName}</h2>
          <p className="mt-2 max-w-2xl text-muted">
            A straightforward VPN service: subscribe, provision access, pick a location, connect.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Simple setup",
                body: "Download a configuration for your device and follow clear setup instructions.",
              },
              {
                title: "Device limits you control",
                body: "Plans include a clear device allowance — rename or revoke devices anytime.",
              },
              {
                title: "Honest positioning",
                body: "We avoid slogans we cannot substantiate. Privacy details ship with reviewed legal copy.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="font-display text-xl">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-3xl">Simple pricing</h2>
            <p className="mt-2 text-muted">No artificial discounts. Change prices in configuration.</p>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {[monthly, annual].map((plan) => (
                <div key={plan.id} className="rounded-2xl border border-border bg-background p-6">
                  <p className="text-sm text-muted">{plan.billingInterval === "month" ? "Monthly" : "Annual"}</p>
                  <p className="mt-2 font-display text-4xl">{formatPrice(plan)}</p>
                  <p className="mt-2 text-sm text-muted">{plan.description}</p>
                  <ul className="mt-6 space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                  <Link href={`/register?plan=${plan.id}`} className="mt-6 inline-block">
                    <Button className="w-full sm:w-auto">Choose {plan.billingInterval}</Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl">Supported devices</h2>
          <p className="mt-2 text-muted">
            Works with standard VPN clients today. Branded apps can be enabled when you publish them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            {["Windows", "macOS", "Linux", "iOS", "Android"].map((d) => (
              <span key={d} className="rounded-md border border-border bg-surface px-4 py-2">
                {d}
              </span>
            ))}
          </div>
          <Link href="/download" className="mt-6 inline-block text-sm text-sea hover:underline">
            View setup instructions →
          </Link>
        </section>

        <section className="border-y border-border bg-surface-2 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-3xl">Locations</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Example coverage for product demos includes London, Frankfurt, Amsterdam, New York, Los
              Angeles, Toronto, Zurich, and Tokyo. Production lists come from your VPN provider.
            </p>
            <Link href="/locations" className="mt-6 inline-block">
              <Button variant="secondary">Browse locations</Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              "Create an account and choose a plan",
              "Complete checkout — VPN access is provisioned automatically",
              "Pick a location, add a device, download your configuration",
            ].map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="font-display text-3xl text-accent">{i + 1}</span>
                <p className="pt-2 text-muted">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border bg-surface py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="font-display text-3xl">FAQ</h2>
            <div className="mt-8 space-y-6">
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="font-medium">{f.q}</h3>
                  <p className="mt-2 text-sm text-muted">{f.a}</p>
                </div>
              ))}
            </div>
            <div className="mt-10">
              <Link href="/register">
                <Button size="lg">Create your account</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
