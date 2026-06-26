import type { ToolContext } from "@studyagent/schemas";
import {
  getToolContract,
  ToolContextIdentityError,
  ToolError,
  ToolNotFoundError,
  ToolReducerValidationError,
  ToolRegistry,
  ToolTimeoutError,
  ToolValidationError,
  validateToolReducerOutput,
  type ExecuteToolOptions,
  type ToolExecutionEvent,
} from "./tool-contracts.js";

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ToolTimeoutError(toolName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function executeTool(
  registry: ToolRegistry,
  toolName: string,
  rawInput: unknown,
  context: ToolContext,
  options: ExecuteToolOptions = {},
): Promise<unknown> {
  const tool = registry.get(toolName);
  if (!tool) {
    throw new ToolNotFoundError(toolName);
  }
  const contract = getToolContract(toolName);
  if (
    contract?.operationKind === "write" &&
    (!context.sessionId || !context.runId || !context.turnId)
  ) {
    throw new ToolContextIdentityError(toolName);
  }

  const now = options.now ?? (() => new Date());
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const toolCallId = options.toolCallId ?? `tool_${crypto.randomUUID().replaceAll("-", "")}`;
  const eventBase = {
    toolCallId,
    toolName,
    notebookId: context.notebookId,
    runId: context.runId,
    sideEffectClass: tool.sideEffectClass,
    startedAt,
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
  };

  await options.onEvent?.({
    eventType: "agent.tool.started",
    ...eventBase,
  });

  try {
    const parsedInput = tool.inputSchema.safeParse(normalizeToolInputAliases(rawInput));
    if (!parsedInput.success) {
      throw new ToolValidationError(toolName, parsedInput.error.flatten());
    }

    const rawOutput = await withTimeout(
      tool.execute(parsedInput.data, context),
      tool.timeoutMs,
      toolName,
    );
    const parsedOutput = tool.outputSchema.safeParse(rawOutput);
    if (!parsedOutput.success) {
      throw new ToolValidationError(toolName, parsedOutput.error.flatten());
    }

    try {
      validateToolReducerOutput(toolName, parsedOutput.data);
    } catch (error) {
      if (error instanceof ToolReducerValidationError) {
        throw new ToolValidationError(toolName, error.cause);
      }
      throw error;
    }

    const latencyMs = now().getTime() - startedAtDate.getTime();
    await options.onEvent?.({
      eventType: "agent.tool.completed",
      ...eventBase,
      latencyMs,
      payload: { outputSummary: summarizeToolOutput(parsedOutput.data) },
    });

    return parsedOutput.data;
  } catch (error) {
    const latencyMs = now().getTime() - startedAtDate.getTime();
    await options.onEvent?.({
      eventType: "agent.tool.failed",
      ...eventBase,
      latencyMs,
      payload: {
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof ToolError ? error.code : "tool_execution_error",
        ...(error instanceof ToolValidationError ? { details: error.cause } : {}),
      },
    });
    throw error;
  }
}

export function normalizeToolInputAliases(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeToolInputAliases);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[snakeToCamel(key)] = normalizeToolInputAliases(child);
  }
  return result;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function summarizeToolOutput(output: unknown): string {
  if (output == null) {
    return "empty";
  }

  if (Array.isArray(output)) {
    return `array(${output.length})`;
  }

  if (typeof output === "object") {
    return `object(${Object.keys(output).length} keys)`;
  }

  return typeof output;
}
