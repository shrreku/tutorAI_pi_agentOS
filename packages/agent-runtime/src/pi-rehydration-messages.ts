export type SimpleRehydrationMessage = {
  role: "user" | "assistant";
  content: string;
};

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function isRecoverablePiSessionDispatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return lower.includes("totaltokens") || lower.includes("calculatecontexttokens");
}

export function normalizeRehydrationMessagesForPiSession(
  messages: SimpleRehydrationMessage[],
  model: { id: string; provider?: string; api?: string },
): unknown[] {
  const api = model.api ?? "openrouter";
  const provider = model.provider ?? "openrouter";
  const modelId = model.id;
  const baseTimestamp = Date.now();

  return messages.map((message, index) => {
    const timestamp = baseTimestamp + index;
    if (message.role === "user") {
      return {
        role: "user",
        content: [{ type: "text", text: message.content }],
        timestamp,
      };
    }

    return {
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api,
      provider,
      model: modelId,
      usage: { ...EMPTY_USAGE, cost: { ...EMPTY_USAGE.cost } },
      stopReason: "stop",
      timestamp,
    };
  });
}
