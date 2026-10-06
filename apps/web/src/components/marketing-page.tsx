import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export async function MarketingPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  return (
    <div>
      <SiteHeader authed={Boolean(user)} />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-muted">{description}</p> : null}
        <div className="mt-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalDraftNotice() {
  return (
    <p className="mb-8 rounded-md border border-accent/40 bg-accent-soft/40 px-4 py-3 text-sm">
      Draft placeholder only — not legal advice. Replace with counsel-reviewed documents before launch.
      Do not treat statements here as commitments about logging, jurisdiction, refunds, or infrastructure.
    </p>
  );
}

export function BackHome() {
  return (
    <Link href="/" className="text-sm text-sea hover:underline">
      ← Home
    </Link>
  );
}
