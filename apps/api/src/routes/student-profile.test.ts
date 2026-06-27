import { describe, expect, it } from "vitest";
import { studentProfileHttpPatchSchema } from "./student-profile.js";

describe("studentProfileHttpPatchSchema", () => {
  it("does not admit a client-supplied userId into the persisted patch", () => {
    const parsed = studentProfileHttpPatchSchema.parse({
      userId: "user_attacker",
      pacePreference: "slower",
    });

    expect(parsed).toEqual({ pacePreference: "slower" });
    expect(Object.keys(parsed)).not.toContain("userId");
  });
});
