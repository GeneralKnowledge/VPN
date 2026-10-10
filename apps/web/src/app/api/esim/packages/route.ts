import { handle } from "@/lib/http";
import { getEsimProvider } from "@/lib/providers";
import { requireProduct } from "@/lib/product";

export async function GET(req: Request) {
  return handle(async () => {
    await requireProduct("esim");
    const url = new URL(req.url);
    const country = url.searchParams.get("country") ?? undefined;
    const packages = await getEsimProvider().listPackages(country ? { country } : undefined);
    return Response.json({ packages });
  });
}
