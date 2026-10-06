import { describe, expect, it } from "vitest";
import { users } from "./schema";

describe("schema", () => {
  it("exports users table", () => {
    expect(users).toBeDefined();
  });
});
