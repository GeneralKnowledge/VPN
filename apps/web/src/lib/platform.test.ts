import { describe, expect, it } from "vitest";
import { detectPlatform, importTips, prefersQrImport } from "./platform";

describe("platform helpers", () => {
  it("detects common user agents", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macos");
  });

  it("prefers QR on mobile platforms", () => {
    expect(prefersQrImport("ios")).toBe(true);
    expect(prefersQrImport("android")).toBe(true);
    expect(prefersQrImport("windows")).toBe(false);
  });

  it("returns import tips per platform", () => {
    expect(importTips("ios").length).toBeGreaterThan(1);
    expect(importTips("linux").some((t) => t.includes("wg-quick"))).toBe(true);
  });
});
