import { describe, expect, it } from "vitest";
import { loadRehydrationTranscript } from "./pi-session-rehydration.js";

class FakeDb {
  constructor(private readonly turns: Array<Record<string, unknown>>) {}

  select() {
    const db = this;
    return {
      from() {
        return {
          where() {
            return this;
          },
          orderBy() {
            return this;
          },
          limit(limit: number) {
            return Promise.resolve(db.turns.slice(0, limit));
          },
        };
      },
    };
  }
}

describe("loadRehydrationTranscript", () => {
  it("returns the last turns oldest-first with compact tool summaries", async () => {
    const transcript = await loadRehydrationTranscript(
      { db: new FakeDb([
        {
          turnIndex: 2,
          userMessage: "Can you quiz me?",
          assistantMessage: "Sure, let me prepare one.",
          toolSummaryJson: { tools: [{ toolName: "artifact.create_quiz", status: "completed", latencyMs: 44 }] },
        },
        {
          turnIndex: 1,
          userMessage: "Explain gradients",
          assistantMessage: "Gradients point in the direction of steepest ascent.",
          toolSummaryJson: { tools: [] },
        },
      ]) } as never,
      "sess_1",
      5,
    );

    expect(transcript).toEqual([
      { role: "user", content: "Explain gradients" },
      { role: "assistant", content: "Gradients point in the direction of steepest ascent." },
      { role: "user", content: "Can you quiz me?" },
      {
        role: "assistant",
        content: "Sure, let me prepare one.\n\n[Tool summary]\n- artifact.create_quiz (completed, 44ms)",
      },
    ]);
  });

  it("skips empty messages cleanly", async () => {
    const transcript = await loadRehydrationTranscript(
      { db: new FakeDb([{ turnIndex: 0, userMessage: null, assistantMessage: "  ", toolSummaryJson: null }]) } as never,
      "sess_2",
      5,
    );

    expect(transcript).toEqual([]);
  });
});
