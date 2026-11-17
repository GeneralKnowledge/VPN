import { handle } from "@/lib/http";
import { getEsimProvider } from "@/lib/providers";
import { requireProductOrApp } from "@/lib/product";

export async function GET(req: Request) {
  return handle(async () => {
    await requireProductOrApp("esim");
    const url = new URL(req.url);
    const country = url.searchParams.get("country") ?? undefined;
    const packages = await getEsimProvider().listPackages(country ? { country } : undefined);
    return Response.json({ packages });
  });
}
