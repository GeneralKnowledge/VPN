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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
    return Response.json({ error: err.message }, { status: 401 });
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
