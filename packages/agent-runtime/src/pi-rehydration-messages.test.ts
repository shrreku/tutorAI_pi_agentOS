import { describe, expect, it } from "vitest";
import {
  isRecoverablePiSessionDispatchError,
  normalizeRehydrationMessagesForPiSession,
} from "./pi-rehydration-messages.js";

describe("normalizeRehydrationMessagesForPiSession", () => {
  it("adds Pi-compatible assistant usage metadata required by compaction", () => {
    const normalized = normalizeRehydrationMessagesForPiSession(
      [
        { role: "user", content: "Explain gradients" },
        { role: "assistant", content: "Gradients point uphill." },
      ],
      { id: "openrouter/auto", provider: "openrouter", api: "openrouter" },
    );

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual(
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: "Explain gradients" }],
      }),
    );
    expect(normalized[1]).toEqual(
      expect.objectContaining({
        role: "assistant",
        content: [{ type: "text", text: "Gradients point uphill." }],
        stopReason: "stop",
        usage: expect.objectContaining({ totalTokens: 0 }),
      }),
    );
  });
});

describe("isRecoverablePiSessionDispatchError", () => {
  it("detects compaction usage crashes from stale rehydrated sessions", () => {
    expect(
      isRecoverablePiSessionDispatchError(
        new Error("Cannot read properties of undefined (reading 'totalTokens')"),
      ),
    ).toBe(true);
    expect(isRecoverablePiSessionDispatchError(new Error("model dispatch timed out"))).toBe(false);
  });
});
