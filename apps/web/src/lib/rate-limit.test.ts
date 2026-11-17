import { beforeEach, describe, expect, it } from "vitest";
import {
  assertNotRateLimited,
  checkRateLimit,
  clientIp,
  enforceRateLimit,
  recordRateLimitHit,
  resetRateLimits,
} from "./rate-limit";
import { secretsMatch } from "./secrets";

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("blocks after the limit and recovers when the window passes", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkRateLimit("k", 3, 1000, t0).ok).toBe(true);
    const blocked = checkRateLimit("k", 3, 1000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkRateLimit("k", 3, 1000, t0 + 1001).ok).toBe(true);
  });

  it("enforceRateLimit throws a 429 and ignores missing keys", () => {
    for (let i = 0; i < 2; i++) enforceRateLimit("scope", ["a", null, undefined], 2, 60_000);
    expect(() => enforceRateLimit("scope", ["a"], 2, 60_000)).toThrow(/Too many attempts/);
    // A different identity is unaffected: one user cannot lock out another.
    expect(() => enforceRateLimit("scope", ["b"], 2, 60_000)).not.toThrow();
  });

  it("only counts recorded failures, not checks", () => {
    for (let i = 0; i < 10; i++) assertNotRateLimited("login", ["u"], 3);
    for (let i = 0; i < 3; i++) recordRateLimitHit("login", ["u"], 60_000);
    expect(() => assertNotRateLimited("login", ["u"], 3)).toThrow();
    expect(() => assertNotRateLimited("login", ["someone-else"], 3)).not.toThrow();
  });

  it("returns no client address instead of a shared bucket when headers are absent", () => {
    expect(clientIp(new Request("http://x"))).toBeNull();
    // The leftmost entry is client-supplied; the nearest proxy's entry is the rightmost.
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }), {})).toBe("5.6.7.8");
  });

  it("cannot be spoofed by a client prepending X-Forwarded-For entries", () => {
    const spoofed = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.7" } });
    expect(clientIp(spoofed, {})).toBe("203.0.113.7");
  });

  it("counts trusted proxies from the right", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7, 10.0.0.2" } });
    expect(clientIp(req, { TRUSTED_PROXY_COUNT: "2" })).toBe("203.0.113.7");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } }), { TRUSTED_PROXY_COUNT: "2" })).toBeNull();
  });

  it("prefers a configured edge header such as cf-connecting-ip", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7", "cf-connecting-ip": "198.51.100.4" },
    });
    expect(clientIp(req, { CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("198.51.100.4");
    expect(clientIp(new Request("http://x"), { CLIENT_IP_HEADER: "cf-connecting-ip" })).toBeNull();
  });
});

describe("secretsMatch", () => {
  it("matches equal secrets only", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abc", "abd")).toBe(false);
    expect(secretsMatch("abc", "abcd")).toBe(false);
  });

  it("never matches when either side is empty", () => {
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch(null, "x")).toBe(false);
    expect(secretsMatch("x", undefined)).toBe(false);
  });
});
