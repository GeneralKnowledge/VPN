import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { getDb, track } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

const schema = z.object({
  platform: z.enum(["ios", "android", "windows", "macos", "linux"]),
  protocol: z.enum(["wireguard", "openvpn"]).default("wireguard"),
  connectionId: z.string().optional(),
});

/** Mark first-connect setup as completed (analytics + audit). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid input" }, { status: 400 });

    const db = getDb();
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "setup.completed",
      targetType: "user",
      targetId: user.id,
      correlationId: correlationId(),
      metadata: body.data,
    });
    track({
      name: "setup_completed",
      userId: user.id,
      properties: body.data,
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
