import { EstimateError, ESTIMATE_NOTE, todayInUk } from "@northstar/travel-search";
import type { z } from "zod";
import { HttpError } from "./http";

/**
 * Runs one estimate search (docs/TRAVEL-HUB.md, phase 1b): reads the query string, turns a search
 * the model can't estimate into a 400 a customer can read, and marks the answer as an estimate.
 */
export async function estimateResponse<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
  run: (query: z.output<S>, today: string) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<Response> {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(400, sentence(issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid search"));
  }
  try {
    const result = await run(parsed.data, todayInUk());
    return Response.json(
      { estimate: true, currency: "GBP", note: ESTIMATE_NOTE, ...result },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (err) {
    if (err instanceof EstimateError) throw new HttpError(400, sentence(err.message));
    throw err;
  }
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}${/[.!?]$/.test(trimmed) ? "" : "."}`;
}
