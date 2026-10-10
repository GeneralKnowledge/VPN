import { afterEach, describe, expect, it, vi } from "vitest";

describe("pwa helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("detects standalone display-mode", async () => {
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: query.includes("display-mode: standalone"),
      }),
      navigator: {},
    });
    const { isStandaloneDisplay } = await import("./pwa");
    expect(isStandaloneDisplay()).toBe(true);
  });

  it("detects iOS Safari vs Chrome on iOS", async () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      navigator: {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
    });
    vi.stubGlobal("navigator", (window as unknown as { navigator: Navigator }).navigator);
    const { isIosSafari } = await import("./pwa");
    expect(isIosSafari()).toBe(true);
  });
});
