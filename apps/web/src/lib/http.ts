import { ZodError } from "zod";
import { AuthError } from "./auth";
import {
  CUSTOMER_CONFIG_ERROR,
  CUSTOMER_CONNECTION_ERROR,
  CUSTOMER_VPN_ERROR,
  VpnProviderError,
} from "@northstar/vpn-provider";

export function customerErrorResponse(
  err: unknown,
  kind: "vpn" | "connection" | "config" | "generic" = "generic",
  status = 400,
): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.status === 403 ? "Forbidden" : "Unauthorized" }, { status: err.status });
  }
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }

  const message =
    kind === "connection"
      ? CUSTOMER_CONNECTION_ERROR
      : kind === "config"
        ? CUSTOMER_CONFIG_ERROR
        : kind === "vpn"
          ? CUSTOMER_VPN_ERROR
          : "Something went wrong. Please try again.";

  // Never leak provider details to customers
  if (err instanceof VpnProviderError) {
    return Response.json({ error: message }, { status });
  }

  return Response.json({ error: message }, { status });
}

export function adminErrorResponse(err: unknown, status = 400): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof VpnProviderError) {
    return Response.json(
      {
        error: err.message,
        diagnostic: err.toDiagnostic(),
      },
      { status },
    );
  }
  return Response.json(
    { error: err instanceof Error ? err.message : "Failed" },
    { status },
  );
}

/** Friendly VPN status labels for customers */
export function customerVpnStatusLabel(status: string | undefined): string {
  switch (status) {
    case "active":
      return "Ready";
    case "pending":
      return "Setting up";
    case "error":
      return "Needs attention";
    case "disabled":
      return "Paused";
    case "expired":
      return "Expired";
    default:
      return "Not set up";
  }
}

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Parse a JSON body, turning malformed input into a 400 instead of an unhandled 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Parse and validate a JSON body in one step. */
export async function parseBody<T>(req: Request, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): Promise<T> {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid input");
  return parsed.data;
}

type HandleOptions = {
  /** Admin callers see the underlying error message; customers only ever see generic text. */
  audience?: "customer" | "admin";
  kind?: "vpn" | "connection" | "config" | "generic";
};

/**
 * Run a route body with consistent error mapping: auth failures -> 401/403, validation -> 400,
 * rate limits -> 429, everything else -> a logged, generic 500 (never a leaked internal message).
 */
export async function handle(fn: () => Promise<Response>, options: HandleOptions = {}): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError || err instanceof HttpError) {
      return options.audience === "admin" ? adminErrorResponse(err) : customerErrorResponse(err, options.kind);
    }
    if (err instanceof ZodError) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    if (err instanceof VpnProviderError) {
      return options.audience === "admin"
        ? adminErrorResponse(err, 502)
        : customerErrorResponse(err, options.kind ?? "vpn", 502);
    }
    console.error("[api:error]", err);
    return options.audience === "admin"
      ? Response.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 })
      : Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
