import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { users } from "@northstar/db";
import { z } from "zod";
import { SESSION_COOKIE, requireUser, verifyPassword } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { getBillingProvider, getDb, getVpnProvider } from "@/lib/providers";
import { assertNotRateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { deleteUserAccount } from "@/lib/services";
import { correlationId } from "@/lib/utils";

const schema = z.object({ password: z.string().min(1).max(256) });

/** Irreversible, so it requires the current password (a stolen session alone must not be enough). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, schema);
    assertNotRateLimited("delete-account", [`user:${user.id}`], 5);

    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      recordRateLimitHit("delete-account", [`user:${user.id}`], 15 * 60_000);
      throw new HttpError(400, "Password incorrect");
    }

    await deleteUserAccount(db, getVpnProvider(), getBillingProvider(), user, correlationId());
    (await cookies()).delete(SESSION_COOKIE);
    return Response.json({ ok: true });
  });
}
