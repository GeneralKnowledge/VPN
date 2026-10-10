import { esimBrand } from "@northstar/config";

export const metadata = { title: "About" };

export default function EsimAboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">About {esimBrand.name}</h1>
      <p className="mt-4 text-muted">
        {esimBrand.name} sells travel eSIM data under our brand on managed wholesale infrastructure. We keep the
        product lean: clear packages, honest checkout, and a dashboard that shows your QR code when payment clears.
      </p>
    </div>
  );
}
