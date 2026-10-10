import { esimBrand } from "@northstar/config";

export const metadata = { title: "Contact" };

export default function EsimContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Contact</h1>
      <p className="mt-4 text-muted">
        Reach us at{" "}
        <a className="text-sea underline" href={`mailto:${esimBrand.supportEmail}`}>
          {esimBrand.supportEmail}
        </a>
        .
      </p>
    </div>
  );
}
