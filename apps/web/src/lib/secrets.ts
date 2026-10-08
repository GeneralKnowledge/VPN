import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison for shared secrets; empty expected values never match. */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
