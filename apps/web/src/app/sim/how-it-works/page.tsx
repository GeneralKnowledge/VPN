export const metadata = { title: "How it works" };

export default function EsimHowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">How it works</h1>
      <ol className="mt-8 list-decimal space-y-6 pl-5 text-muted">
        <li>
          <span className="font-medium text-foreground">Check your phone supports eSIM</span>
          <p className="mt-1 text-sm">
            Most recent iPhones and many Android devices do. Your phone settings will mention “Add eSIM” or “Add
            mobile plan”.
          </p>
        </li>
        <li>
          <span className="font-medium text-foreground">Buy a package for your destination</span>
          <p className="mt-1 text-sm">One payment covers that plan only — no monthly subscription.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Install from your dashboard</span>
          <p className="mt-1 text-sm">Scan the QR code (or use the activation link) while you still have Wi‑Fi.</p>
        </li>
        <li>
          <span className="font-medium text-foreground">Turn on the line when you arrive</span>
          <p className="mt-1 text-sm">Enable data roaming for the eSIM line if your phone asks.</p>
        </li>
      </ol>
    </div>
  );
}
