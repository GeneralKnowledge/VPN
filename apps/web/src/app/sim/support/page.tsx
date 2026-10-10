import Link from "next/link";
import { esimBrand } from "@northstar/config";

export const metadata = { title: "Support" };

export default function EsimSupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Support</h1>
      <p className="mt-4 text-muted">
        For install help or order questions, email{" "}
        <a className="text-sea underline" href={`mailto:${esimBrand.supportEmail}`}>
          {esimBrand.supportEmail}
        </a>
        . Signed-in customers can also open a ticket from the{" "}
        <Link href="/dashboard/support" className="text-sea underline">
          dashboard
        </Link>
        .
      </p>
    </div>
  );
}
