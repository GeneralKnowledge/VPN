import { describe, expect, it } from "vitest";
import { createEmailProvider, MockEmailProvider, renderTemplate } from "./index";

describe("email templates", () => {
  it("renders welcome without inventing privacy claims", () => {
    const msg = renderTemplate("welcome", { name: "Alex" });
    expect(msg.subject).toContain("Northstar");
    expect(msg.text.toLowerCase()).not.toContain("100% anonymous");
  });
});

describe("MockEmailProvider", () => {
  it("logs messages locally", async () => {
    const email = new MockEmailProvider();
    await email.send({ to: "a@test.local", template: "verify_email", vars: { name: "A", link: "http://x" } });
    expect(email.getSent()).toHaveLength(1);
    expect(createEmailProvider("mock")).toBeInstanceOf(MockEmailProvider);
  });
});
