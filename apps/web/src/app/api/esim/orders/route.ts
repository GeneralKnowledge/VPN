import { requireUser } from "@/lib/auth";
import { listUserEsimOrders } from "@/lib/esim-services";
import { HttpError, handle } from "@/lib/http";
import { getDb } from "@/lib/providers";
import { getProduct } from "@/lib/product";

export async function GET() {
  return handle(async () => {
    if ((await getProduct()) !== "esim") {
      throw new HttpError(404, "Not available on this host");
    }
    const user = await requireUser();
    const rows = await listUserEsimOrders(getDb(), user.id);
    return Response.json({
      orders: rows.map(({ order, profile }) => ({
        id: order.id,
        packageCode: order.packageCode,
        packageName: order.packageName,
        countryCode: order.countryCode,
        dataVolume: order.dataVolume,
        validity: order.validity,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
        profile: profile
          ? {
              iccid: profile.iccid,
              qrCodeUrl: profile.qrCodeUrl,
              activationUrl: profile.activationUrl,
              status: profile.status,
              issuedAt: profile.issuedAt,
            }
          : null,
      })),
    });
  });
}
