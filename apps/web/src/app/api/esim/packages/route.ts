import { handle } from "@/lib/http";
import { getEsimProvider } from "@/lib/providers";
import { getProduct } from "@/lib/product";

export async function GET(req: Request) {
  return handle(async () => {
    const product = await getProduct();
    if (product !== "esim") {
      return Response.json({ error: "Not available on this host" }, { status: 404 });
    }
    const url = new URL(req.url);
    const country = url.searchParams.get("country") ?? undefined;
    const packages = await getEsimProvider().listPackages(country ? { country } : undefined);
    return Response.json({ packages });
  });
}
