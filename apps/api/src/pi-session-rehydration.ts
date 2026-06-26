import { desc, eq } from "drizzle-orm";
import { tutorTurns, type DbClient } from "@studyagent/db";

type RehydrationMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function loadRehydrationTranscript(
  dbClient: DbClient,
  sessionId: string,
  limit = 5,
): Promise<RehydrationMessage[]> {
  const baseQuery = dbClient.db
    .select({
      turnIndex: tutorTurns.turnIndex,
      userMessage: tutorTurns.userMessage,
      assistantMessage: tutorTurns.assistantMessage,
      toolSummaryJson: tutorTurns.toolSummaryJson,
    })
    .from(tutorTurns)
    .where(eq(tutorTurns.sessionId, sessionId));
  const orderedQuery =
    typeof (baseQuery as { orderBy?: unknown }).orderBy === "function"
      ? (
          baseQuery as {
            orderBy: (value: unknown) => {
              limit: (count: number) => Promise<Array<Record<string, unknown>>>;
            };
          }
        ).orderBy(desc(tutorTurns.turnIndex))
      : (baseQuery as { limit: (count: number) => Promise<Array<Record<string, unknown>>> });
  const turns = (await orderedQuery.limit(limit))
    .slice()
    .sort((left, right) => Number(right.turnIndex ?? -1) - Number(left.turnIndex ?? -1));

  return turns
    .slice()
    .reverse()
    .flatMap((turn) => {
      const messages: RehydrationMessage[] = [];
      const userMessage = typeof turn.userMessage === "string" ? turn.userMessage.trim() : "";
      const assistantMessage =
        typeof turn.assistantMessage === "string" ? turn.assistantMessage.trim() : "";
      const toolSummary = summarizeTools(turn.toolSummaryJson);

      if (userMessage) {
        messages.push({ role: "user", content: userMessage });
      }
      if (assistantMessage || toolSummary) {
        messages.push({
          role: "assistant",
          content: [assistantMessage, toolSummary].filter(Boolean).join("\n\n"),
        });
      }
      return messages;
    });
}

function summarizeTools(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const tools = (value as { tools?: unknown[] }).tools;
  if (!Array.isArray(tools) || tools.length === 0) return "";
  const summary = tools
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
      const toolName =
        typeof (entry as { toolName?: unknown }).toolName === "string"
          ? (entry as { toolName: string }).toolName
          : null;
      if (!toolName) return [];
      const status =
        typeof (entry as { status?: unknown }).status === "string"
          ? (entry as { status: string }).status
          : "completed";
      const latencyMs =
        typeof (entry as { latencyMs?: unknown }).latencyMs === "number"
          ? (entry as { latencyMs: number }).latencyMs
          : null;
      return [`- ${toolName} (${status}${latencyMs !== null ? `, ${latencyMs}ms` : ""})`];
    })
    .slice(0, 5);
  if (!summary.length) return "";
  return ["[Tool summary]", ...summary].join("\n");
}
