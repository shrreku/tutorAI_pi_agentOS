import type { EventEnvelope } from "@studyagent/schemas";
import { getModel, Type } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  defineTool,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
/** Payload fragment persisted on tutor/agent events (GF-0501 / observability). */
export function runTelemetryPayload(run: StudyAgentRuntimeRun): Record<string, unknown> {
  return {
    runId: run.runId,
    traceId: run.traceId,
    model: run.modelConfig.model,
    provider: run.modelConfig.provider,
    promptTemplateVersion: run.modelConfig.promptTemplateVersion,
  };
}

export type TutorAppendEventInput = {
  notebookId: string;
  sessionId?: string;
  runId?: string;
  eventType: string;
  payload: Record<string, unknown>;
};

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
};

type JsonSchemaLike = JsonSchema & Record<string, unknown>;

export type PiToolMetadata = {
  name: string;
  label: string;
  description: string;
  parameters: PiToolParameters;
};

export function getPiToolParameters(toolName: string): PiToolParameters {
  const contract = getToolContract(toolName);
  if (!contract) {
    return Type.Object({}, { additionalProperties: true });
  }
  return zodSchemaToPiToolParameters(contract.inputSchema);
}

export function getPiToolMetadata(toolName: string): PiToolMetadata {
  const contract = getToolContract(toolName);
  if (!contract) {
    return {
      name: toolName,
      label: toolName,
      description: toolName,
      parameters: Type.Object({}, { additionalProperties: true }),
    };
  }

  return {
    name: contract.name,
    label: contract.name,
    description: contract.description,
    parameters: getPiToolParameters(toolName),
  };
}

function zodSchemaToPiToolParameters(schema: { toJSONSchema?: () => unknown }): PiToolParameters {
  const jsonSchema = schema.toJSONSchema?.();
  const piSchema = jsonSchemaToPiSchema(jsonSchema);
  if (!isJsonSchemaObject(piSchema) || piSchema.type !== "object") {
    return Type.Object({}, { additionalProperties: true });
  }
  return piSchema as unknown as PiToolParameters;
}

function jsonSchemaToPiSchema(schema: unknown): JsonSchemaLike {
  if (!isJsonSchemaObject(schema)) {
    return {};
  }

  const unionMember = firstConcreteUnionMember(schema);
  if (unionMember) {
    return jsonSchemaToPiSchema(unionMember);
  }

  const type = Array.isArray(schema.type)
    ? schema.type.find((candidate) => candidate !== "null")
    : schema.type;

  switch (type) {
    case "object":
      return jsonObjectSchemaToPiSchema(schema);
    case "array": {
      const result: JsonSchemaLike = {
        type: "array",
        items: jsonSchemaToPiSchema(schema.items),
      };
      copyDescription(schema, result);
      return result;
    }
    case "string": {
      const result: JsonSchemaLike = { type: "string" };
      copyDescription(schema, result);
      return result;
    }
    case "integer":
    case "number": {
      const result: JsonSchemaLike = { type: "number" };
      copyDescription(schema, result);
      return result;
    }
    case "boolean": {
      const result: JsonSchemaLike = { type: "boolean" };
      copyDescription(schema, result);
      return result;
    }
    default:
      return {};
  }
}

function jsonObjectSchemaToPiSchema(schema: JsonSchema): JsonSchemaLike {
  const properties: Record<string, JsonSchemaLike> = {};
  for (const [propertyName, propertySchema] of Object.entries(schema.properties ?? {})) {
    properties[propertyName] = jsonSchemaToPiSchema(propertySchema);
  }

  const required = (schema.required ?? []).filter((propertyName) => {
    const propertySchema = schema.properties?.[propertyName];
    return !isJsonSchemaObject(propertySchema) || !("default" in propertySchema);
  });

  const result: JsonSchemaLike = {
    type: "object",
    properties,
  };
  if (required.length > 0) {
    result.required = required;
  }
  if (schema.additionalProperties === true || isJsonSchemaObject(schema.additionalProperties)) {
    result.additionalProperties = true;
  }
  copyDescription(schema, result);
  return result;
}

function firstConcreteUnionMember(schema: JsonSchema): JsonSchema | undefined {
  const candidates = schema.anyOf ?? schema.oneOf;
  return candidates?.find((candidate) => {
    const type = Array.isArray(candidate.type) ? candidate.type : [candidate.type];
    return !type.includes("null");
  });
}

function copyDescription(source: JsonSchema, target: JsonSchemaLike): void {
  if (typeof source.description === "string" && source.description.length > 0) {
    target.description = source.description;
  }
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaLike {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function appendEventBase(run: StudyAgentRuntimeRun): { notebookId: string; runId: string; sessionId?: string } {
  const base: { notebookId: string; runId: string; sessionId?: string } = {
    notebookId: run.notebookId,
    runId: run.runId,
  };
  if (run.sessionId !== undefined) {
    base.sessionId = run.sessionId;
  }
  return base;
}

/** Maps streaming session events to durable event rows (use with `appendEvent`). */
export function mapPiSessionEventToAppendInput(
  event: PiAgentSessionEvent,
  run: StudyAgentRuntimeRun,
): TutorAppendEventInput | null {
  const t = runTelemetryPayload(run);
  const base = appendEventBase(run);

  switch (event.type) {
    case "message_start":
      return {
        ...base,
        eventType: "agent.run.started",
        payload: { phase: "started", rawRuntimeEventType: event.type, ...t },
      };
    case "message_delta":
      return {
        ...base,
        eventType: "tutor.message.delta",
        payload: { text: event.data.text, rawRuntimeEventType: event.type, ...t },
      };
    case "message_complete":
      return {
        ...base,
        eventType: "tutor.message.completed",
        payload: { text: event.data.text, stopReason: event.data.stopReason, rawRuntimeEventType: event.type, ...t },
      };
    case "tool_call_start":
      return {
        ...base,
        eventType: "agent.tool.started",
        payload: {
          toolName: event.data.toolName,
          toolCallId: event.data.toolCallId,
          args: event.data.args,
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    case "tool_call_complete": {
      const reducerResult = extractValidatedReducerResult(event.data.result);
      return {
        ...base,
        eventType: "agent.tool.completed",
        payload: {
          toolName: event.data.toolName,
          toolCallId: event.data.toolCallId,
          args: event.data.args,
          result: event.data.result,
          ...(reducerResult ? { reducerResult } : {}),
          rawRuntimeEventType: event.type,
          ...t,
        },
      };
    }
    case "run_complete":
      return {
        ...base,
        eventType: "agent.run.completed",
        payload: { phase: "completed", rawRuntimeEventType: event.type, ...t },
      };
    case "run_error":
      return {
        ...base,
        eventType: "agent.run.failed",
        payload: { failureKind: event.data.code, safeMessage: event.data.error, rawRuntimeEventType: event.type, ...t },
      };
    default:
      return null;
  }
}
import type { StudyAgentRuntimeRun, StudyAgentPromptContext } from "./index.js";
import {
  buildStudyAgentSystemPrompt,
  createRuntimeId,
} from "./index.js";
import {
  executeTool,
  extractValidatedReducerResult,
  getToolContract,
  normalizeToolInputAliases,
  ToolError,
  ToolValidationError,
  TOOL_CONTRACT_CATALOG,
  type ToolRegistry,
} from "@studyagent/tools";
import { classifyRuntimeError } from "./failure.js";

export type PiAgentSessionConfig = {
  model: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  providerApiKey?: string;
  baseUrl?: string;
  useMock?: boolean;
};

export type PiSessionAction = "prompt" | "steer" | "followUp";

export type PiAgentSessionInput = {
  run: StudyAgentRuntimeRun;
  turnId?: string;
  promptContext: StudyAgentPromptContext;
  userMessage: string;
  toolRegistry: ToolRegistry;
  action?: PiSessionAction;
  config?: Partial<PiAgentSessionConfig>;
  onToolLifecycleEvent?: (event: ToolLifecycleEvent) => Promise<void> | void;
};

export type ToolLifecycleEvent =
  | {
      phase: "started";
      toolCallId: string;
      toolName: string;
      sideEffectClass: string;
      input: unknown;
      startedAt: string;
    }
  | {
      phase: "completed";
      toolCallId: string;
      toolName: string;
      sideEffectClass: string;
      input: unknown;
      output: unknown;
      startedAt: string;
      latencyMs: number;
    }
  | {
      phase: "failed";
      toolCallId: string;
      toolName: string;
      sideEffectClass: string;
      input: unknown;
      startedAt: string;
      latencyMs: number;
      code: string;
      error: string;
      details?: unknown;
    };

export type PiAgentSessionEvent =
  | { type: "message_start"; data: { runId: string } }
  | { type: "message_delta"; data: { text: string } }
  | { type: "message_complete"; data: { text: string; stopReason: string } }
  | { type: "tool_call_start"; data: { toolName: string; toolCallId: string; args?: unknown } }
  | { type: "tool_call_complete"; data: { toolName: string; toolCallId: string; args?: unknown; result: unknown } }
  | { type: "run_complete"; data: { runId: string; usage?: unknown; model?: string; promptTemplateVersion?: string } }
  | { type: "run_error"; data: { error: string; code: string } };

type PiToolParameters = ReturnType<typeof Type.Object>;

type CachedPiSession = {
  session: {
    prompt(message: string): Promise<void>;
    subscribe(handler: (event: AgentSessionEvent) => void): () => void;
    dispose(): void;
    messages: unknown[];
    steer?: (message: string) => Promise<void>;
    followUp?: (message: string) => Promise<void>;
  };
  binding: StudyAgentRuntimeBinding;
};

export type StudyAgentRuntimeBinding = {
  notebookId: string;
  sessionId: string;
  userId: string;
  activeMode: StudyAgentRuntimeRun["activeMode"];
  selectedNodeRefsFingerprint: string;
  hostStateSignature?: string;
  promptTemplateVersion: string;
  replacedAt: string;
  reason: "created" | "notebook_changed" | "session_changed" | "user_changed" | "mode_changed" | "selected_refs_changed" | "host_state_changed" | "prompt_changed" | "manual";
};

const livePiSessions = new Map<string, CachedPiSession>();

export function getStudyAgentTutorRuntimeBinding(sessionId: string): StudyAgentRuntimeBinding | null {
  return livePiSessions.get(sessionId)?.binding ?? null;
}

export async function disposeStudyAgentTutorSession(sessionId: string): Promise<void> {
  const cached = livePiSessions.get(sessionId);
  if (!cached) return;
  livePiSessions.delete(sessionId);
  cached.session.dispose();
}

export async function replaceStudyAgentTutorRuntime(input: {
  previousSessionId?: string;
  nextRun: StudyAgentRuntimeRun;
  reason?: StudyAgentRuntimeBinding["reason"];
}): Promise<{ replaced: boolean; disposedSessionId: string | null; binding: StudyAgentRuntimeBinding | null }> {
  const nextSessionId = input.nextRun.sessionId;
  if (!nextSessionId) {
    return { replaced: false, disposedSessionId: null, binding: null };
  }

  const previousSessionId = input.previousSessionId ?? nextSessionId;
  const existing = livePiSessions.get(previousSessionId);
  const existingBinding = existing?.binding;
  const nextSelectedNodeRefsFingerprint = fingerprintSelectedNodeRefs(input.nextRun.selectedNodeRefs);
  const materialChange =
    input.reason === "manual" ||
    previousSessionId !== nextSessionId ||
    existingBinding?.notebookId !== input.nextRun.notebookId ||
    existingBinding?.userId !== input.nextRun.userId ||
    (existingBinding?.activeMode !== undefined && existingBinding.activeMode !== input.nextRun.activeMode) ||
    (existingBinding?.selectedNodeRefsFingerprint !== undefined &&
      existingBinding.selectedNodeRefsFingerprint !== nextSelectedNodeRefsFingerprint) ||
    (existingBinding?.hostStateSignature !== undefined &&
      existingBinding.hostStateSignature !== input.nextRun.hostStateSignature) ||
    existingBinding?.promptTemplateVersion !== input.nextRun.modelConfig.promptTemplateVersion;

  if (!existing || !materialChange) {
    return { replaced: false, disposedSessionId: null, binding: existingBinding ?? null };
  }

  livePiSessions.delete(previousSessionId);
  existing.session.dispose();
  return {
    replaced: true,
    disposedSessionId: previousSessionId,
    binding: {
      notebookId: input.nextRun.notebookId,
      sessionId: nextSessionId,
      userId: input.nextRun.userId,
      activeMode: input.nextRun.activeMode,
      selectedNodeRefsFingerprint: nextSelectedNodeRefsFingerprint,
      ...(input.nextRun.hostStateSignature ? { hostStateSignature: input.nextRun.hostStateSignature } : {}),
      promptTemplateVersion: input.nextRun.modelConfig.promptTemplateVersion,
      replacedAt: new Date().toISOString(),
      reason:
        input.reason
        ?? (previousSessionId !== nextSessionId
          ? "session_changed"
          : existingBinding?.notebookId !== input.nextRun.notebookId
            ? "notebook_changed"
            : existingBinding?.userId !== input.nextRun.userId
              ? "user_changed"
            : existingBinding?.activeMode !== undefined && existingBinding.activeMode !== input.nextRun.activeMode
                ? "mode_changed"
                : existingBinding?.selectedNodeRefsFingerprint !== undefined &&
                    existingBinding.selectedNodeRefsFingerprint !== nextSelectedNodeRefsFingerprint
                  ? "selected_refs_changed"
                  : existingBinding?.hostStateSignature !== undefined &&
                      existingBinding.hostStateSignature !== input.nextRun.hostStateSignature
                    ? "host_state_changed"
                  : "prompt_changed"),
    },
  };
}

export async function* runStudyAgentTutorSession(input: PiAgentSessionInput): AsyncGenerator<PiAgentSessionEvent> {
  if (input.config?.useMock) {
    yield* runMockStudyAgentTutorSession(input);
    return;
  }

  const { run, promptContext, userMessage, toolRegistry } = input;
  const action = input.action ?? "prompt";
  const systemPrompt = buildStudyAgentSystemPrompt(promptContext);
  const { queue, push, end, iterate } = createEventQueue<PiAgentSessionEvent>();
  let assistantText = "";
  let completed = false;
  let toolCallCount = 0;
  let sawToolActivity = false;

  const toolContext = {
    userId: run.userId,
    notebookId: run.notebookId,
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    runId: run.runId,
    traceId: run.traceId,
    selectedNodeRefs: run.selectedNodeRefs,
    permissions: { read: true, write: true },
  } as const;

  push({
    type: "message_start",
    data: { runId: run.runId },
  });

  const authStorage = AuthStorage.inMemory();
  if (input.config?.providerApiKey) {
    authStorage.setRuntimeApiKey("openrouter", input.config.providerApiKey);
  }
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: `${process.cwd()}/.studyagent-pi`,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
    extensionsOverride: (base) => ({ ...base, extensions: [], errors: [] }),
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    themesOverride: () => ({ themes: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  const modelId = input.config?.model ?? run.modelConfig.model;
  const baseModel = getModel("openrouter", modelId as never);
  const model = input.config?.baseUrl ? { ...baseModel, baseUrl: input.config.baseUrl } : baseModel;
  const catalogNames = new Set<string>(TOOL_CONTRACT_CATALOG.map((contract) => contract.name));
  const customTools = toolRegistry.list().filter((tool) => catalogNames.has(tool.name)).map((tool) => {
    const metadata = getPiToolMetadata(tool.name);
    return defineTool({
      name: metadata.name,
      label: metadata.label,
      description: metadata.description,
      parameters: metadata.parameters,
      execute: async (toolCallId, params) => {
        const startedAt = new Date();
        const lifecycleInput = normalizeToolInputAliases(params);
        try {
          toolCallCount = reserveRuntimeToolCallBudget(toolCallCount, run.budgets.maxToolCalls);
        } catch (error) {
          const failure = classifyRuntimeError(error);
          const resumableDraft = await createResumableQuizDraftForBudgetExhaustion(
            toolRegistry,
            tool.name,
            lifecycleInput,
            toolContext,
          );
          if (resumableDraft) {
            await input.onToolLifecycleEvent?.({
              phase: "started",
              toolCallId,
              toolName: tool.name,
              sideEffectClass: tool.sideEffectClass,
              input: { ...asRecord(lifecycleInput), deferGeneration: true },
              startedAt: startedAt.toISOString(),
            });
            await input.onToolLifecycleEvent?.({
              phase: "completed",
              toolCallId,
              toolName: tool.name,
              sideEffectClass: tool.sideEffectClass,
              input: { ...asRecord(lifecycleInput), deferGeneration: true },
              output: resumableDraft,
              startedAt: startedAt.toISOString(),
              latencyMs: Date.now() - startedAt.getTime(),
            });
            return resumableDraft as never;
          }
          await input.onToolLifecycleEvent?.({
            phase: "failed",
            toolCallId,
            toolName: tool.name,
            sideEffectClass: tool.sideEffectClass,
            input: lifecycleInput,
            startedAt: startedAt.toISOString(),
            latencyMs: Date.now() - startedAt.getTime(),
            code: failure.code,
            error: failure.safeMessage,
            ...(error instanceof ToolValidationError ? { details: error.cause } : {}),
          });
          throw new Error(failure.safeMessage);
        }
        await input.onToolLifecycleEvent?.({
          phase: "started",
          toolCallId,
          toolName: tool.name,
          sideEffectClass: tool.sideEffectClass,
          input: lifecycleInput,
          startedAt: startedAt.toISOString(),
        });

        try {
          const result = await executeTool(toolRegistry, tool.name, lifecycleInput, toolContext);
          const latencyMs = Date.now() - startedAt.getTime();
          await input.onToolLifecycleEvent?.({
            phase: "completed",
            toolCallId,
            toolName: tool.name,
            sideEffectClass: tool.sideEffectClass,
            input: lifecycleInput,
            output: result,
            startedAt: startedAt.toISOString(),
            latencyMs,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(truncateToolResult(result)),
              },
            ],
            details: result,
          };
        } catch (error) {
          const failure = classifyRuntimeError(error);
          await input.onToolLifecycleEvent?.({
            phase: "failed",
            toolCallId,
            toolName: tool.name,
            sideEffectClass: tool.sideEffectClass,
            input: lifecycleInput,
            startedAt: startedAt.toISOString(),
            latencyMs: Date.now() - startedAt.getTime(),
            code: failure.code,
            error: failure.safeMessage,
            ...(error instanceof ToolValidationError ? { details: error.cause } : {}),
          });
          throw new Error(failure.safeMessage);
        }
      },
    });
  });

  const cachedSession = run.sessionId ? livePiSessions.get(run.sessionId) : undefined;
  const session = cachedSession?.session
    ?? (
      await createAgentSession({
        cwd: process.cwd(),
        model,
        thinkingLevel: "off",
        authStorage,
        noTools: "builtin",
        tools: customTools.map((tool) => tool.name),
        customTools,
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(),
        settingsManager: SettingsManager.inMemory({
          compaction: { enabled: true, reserveTokens: Math.max(1000, Math.floor(run.budgets.maxContextTokens * 0.1)) },
          retry: { enabled: false, maxRetries: 0 },
        }),
      })
    ).session;

  if (run.sessionId && !cachedSession) {
    livePiSessions.set(run.sessionId, {
      session: session as CachedPiSession["session"],
      binding: {
        notebookId: run.notebookId,
        sessionId: run.sessionId,
        userId: run.userId,
        activeMode: run.activeMode,
        selectedNodeRefsFingerprint: fingerprintSelectedNodeRefs(run.selectedNodeRefs),
        ...(run.hostStateSignature ? { hostStateSignature: run.hostStateSignature } : {}),
        promptTemplateVersion: run.modelConfig.promptTemplateVersion,
        replacedAt: new Date().toISOString(),
        reason: "created",
      },
    });
  }

  const unsubscribe = session.subscribe((event) => {
    handlePiSdkEvent(event, {
      onMessageDelta(text) {
        assistantText += text;
        push({ type: "message_delta", data: { text } });
      },
      onToolStart(toolName, toolCallId, args) {
        sawToolActivity = true;
        push({ type: "tool_call_start", data: { toolName, toolCallId, args } });
      },
      onToolComplete(toolName, toolCallId, args, result) {
        sawToolActivity = true;
        push({ type: "tool_call_complete", data: { toolName, toolCallId, args, result } });
      },
    });
  });

  const dispatch =
    action === "steer" && typeof (session as { steer?: (message: string) => Promise<void> }).steer === "function"
      ? (session as { steer: (message: string) => Promise<void> }).steer.bind(session)
      : action === "followUp" && typeof (session as { followUp?: (message: string) => Promise<void> }).followUp === "function"
        ? (session as { followUp: (message: string) => Promise<void> }).followUp.bind(session)
        : session.prompt.bind(session);

  void dispatch(userMessage)
    .then(async () => {
      if (action !== "prompt" && assistantText.trim().length === 0) {
        await session.prompt(userMessage);
      }
      let finalText = assistantText || extractAssistantTextFromMessages(session.messages);
      if (finalText.trim().length === 0 && !sawToolActivity) {
        await session.prompt(userMessage);
        finalText = assistantText || extractAssistantTextFromMessages(session.messages);
      }
      if (finalText.trim().length === 0) {
        if (!sawToolActivity) {
          for await (const fallbackEvent of runMockStudyAgentTutorSession({
            ...input,
            config: { ...input.config, useMock: true },
          })) {
            if (fallbackEvent.type !== "message_start") {
              push(fallbackEvent);
            }
          }
          completed = true;
          return;
        }
        push({
          type: "run_error",
          data: {
            error: "Model completed without assistant text or tool calls",
            code: "empty_model_response",
          },
        });
        return;
      }
      const finalAssistantMessage = extractLastAssistantMessage(session.messages);
      push({
        type: "message_complete",
        data: {
          text: finalText,
          stopReason: "end_turn",
        },
      });
      push({
        type: "run_complete",
        data: {
          runId: run.runId,
          ...(finalAssistantMessage?.usage ? { usage: finalAssistantMessage.usage } : {}),
          ...(finalAssistantMessage?.model ? { model: finalAssistantMessage.model } : {}),
          promptTemplateVersion: run.modelConfig.promptTemplateVersion,
        },
      });
      completed = true;
    })
    .catch((error) => {
      const failure = classifyRuntimeError(error);
      push({
        type: "run_error",
        data: {
          error: failure.safeMessage,
          code: failure.code,
        },
      });
    })
    .finally(() => {
      unsubscribe();
      if (!run.sessionId) {
        session.dispose();
      }
      end();
    });

  try {
    for await (const event of iterate()) {
      yield event;
    }
  } finally {
    if (!completed) {
      unsubscribe();
      if (!run.sessionId) {
        session.dispose();
      }
      queue.closed = true;
    }
  }
}

function fingerprintSelectedNodeRefs(
  refs: Array<{ refType: string; refId: string }>,
): string {
  return JSON.stringify(
    refs
      .map((ref) => `${ref.refType}:${ref.refId}`)
      .sort(),
  );
}

function reserveRuntimeToolCallBudget(currentCount: number, maxToolCalls: number): number {
  if (currentCount >= maxToolCalls) {
    throw new ToolError(
      "tool_budget_exceeded",
      `Runtime tool budget exceeded: attempted more than ${maxToolCalls} tool calls`,
    );
  }
  return currentCount + 1;
}

async function createResumableQuizDraftForBudgetExhaustion(
  toolRegistry: ToolRegistry,
  toolName: string,
  args: unknown,
  toolContext: Parameters<typeof executeTool>[3],
): Promise<unknown | null> {
  if (toolName !== "artifact.create_quiz") return null;
  return executeTool(toolRegistry, toolName, { ...asRecord(args), deferGeneration: true }, toolContext);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function promptStudyAgentTutorSession(input: PiAgentSessionInput): AsyncGenerator<PiAgentSessionEvent> {
  return runStudyAgentTutorSession({ ...input, action: "prompt" });
}

export function steerStudyAgentTutorSession(input: PiAgentSessionInput): AsyncGenerator<PiAgentSessionEvent> {
  return runStudyAgentTutorSession({ ...input, action: "steer" });
}

export function followUpStudyAgentTutorSession(input: PiAgentSessionInput): AsyncGenerator<PiAgentSessionEvent> {
  return runStudyAgentTutorSession({ ...input, action: "followUp" });
}

async function* runMockStudyAgentTutorSession(input: PiAgentSessionInput): AsyncGenerator<PiAgentSessionEvent> {
  const { run, promptContext, userMessage, toolRegistry, onToolLifecycleEvent } = input;
  const action = input.action ?? "prompt";
  let toolCallCount = 0;

  buildStudyAgentSystemPrompt(promptContext);
  if (run.sessionId && !livePiSessions.has(run.sessionId)) {
    livePiSessions.set(run.sessionId, {
      session: {
        prompt: async () => undefined,
        subscribe: () => () => undefined,
        dispose: () => undefined,
        messages: [],
      },
      binding: {
        notebookId: run.notebookId,
        sessionId: run.sessionId,
        userId: run.userId,
        activeMode: run.activeMode,
        selectedNodeRefsFingerprint: fingerprintSelectedNodeRefs(run.selectedNodeRefs),
        ...(run.hostStateSignature ? { hostStateSignature: run.hostStateSignature } : {}),
        promptTemplateVersion: run.modelConfig.promptTemplateVersion,
        replacedAt: new Date().toISOString(),
        reason: "created",
      },
    });
  }
  yield {
    type: "message_start",
    data: { runId: run.runId },
  };

  const plan = planMockTutorSession(userMessage, promptContext);
  const textChunks: string[] = [];

  if (action === "steer") {
    textChunks.push("[steered] ");
    yield { type: "message_delta", data: { text: "[steered] " } };
  } else if (action === "followUp") {
    textChunks.push("[follow-up] ");
    yield { type: "message_delta", data: { text: "[follow-up] " } };
  }

  for (const step of plan.steps) {
    if (step.type === "text") {
      textChunks.push(step.content);
      yield { type: "message_delta", data: { text: step.content } };
      continue;
    }

    const toolDef = toolRegistry.get(step.toolName);
    if (!toolDef) {
      const failure = classifyRuntimeError(new Error(`Tool not found: ${step.toolName}`));
      yield { type: "run_error", data: { error: failure.safeMessage, code: failure.code } };
      return;
    }

    const startedAt = new Date();
    try {
      toolCallCount = reserveRuntimeToolCallBudget(toolCallCount, run.budgets.maxToolCalls);
    } catch (error) {
      const failure = classifyRuntimeError(error);
      const toolContext = {
        userId: run.userId,
        notebookId: run.notebookId,
        ...(run.sessionId ? { sessionId: run.sessionId } : {}),
        ...(input.turnId ? { turnId: input.turnId } : {}),
        runId: run.runId,
        traceId: run.traceId,
        selectedNodeRefs: run.selectedNodeRefs,
        permissions: { read: true, write: true },
      } as const;
      const resumableDraft = await createResumableQuizDraftForBudgetExhaustion(
        toolRegistry,
        step.toolName,
        step.args,
        toolContext,
      );
      if (resumableDraft) {
        const resumableArgs = { ...asRecord(step.args), deferGeneration: true };
        await onToolLifecycleEvent?.({
          phase: "started",
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          sideEffectClass: toolDef.sideEffectClass,
          input: resumableArgs,
          startedAt: startedAt.toISOString(),
        });
        yield {
          type: "tool_call_start",
          data: { toolName: step.toolName, toolCallId: step.toolCallId, args: resumableArgs },
        };
        await onToolLifecycleEvent?.({
          phase: "completed",
          toolCallId: step.toolCallId,
          toolName: step.toolName,
          sideEffectClass: toolDef.sideEffectClass,
          input: resumableArgs,
          output: resumableDraft,
          startedAt: startedAt.toISOString(),
          latencyMs: Date.now() - startedAt.getTime(),
        });
        yield {
          type: "tool_call_complete",
          data: { toolName: step.toolName, toolCallId: step.toolCallId, args: resumableArgs, result: resumableDraft },
        };
        const followup = renderToolResultText(step.toolName, resumableDraft, promptContext);
        if (followup) {
          textChunks.push(followup);
          yield { type: "message_delta", data: { text: followup } };
        }
        continue;
      }
      await onToolLifecycleEvent?.({
        phase: "failed",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        sideEffectClass: toolDef.sideEffectClass,
        input: step.args,
        startedAt: startedAt.toISOString(),
        latencyMs: Date.now() - startedAt.getTime(),
        code: failure.code,
        error: failure.safeMessage,
      });
      yield { type: "run_error", data: { error: failure.safeMessage, code: failure.code } };
      return;
    }
    await onToolLifecycleEvent?.({
      phase: "started",
      toolCallId: step.toolCallId,
      toolName: step.toolName,
      sideEffectClass: toolDef.sideEffectClass,
      input: step.args,
      startedAt: startedAt.toISOString(),
    });

    yield {
      type: "tool_call_start",
      data: { toolName: step.toolName, toolCallId: step.toolCallId, args: step.args },
    };

    try {
      const result = await executeTool(
        toolRegistry,
        step.toolName,
        step.args,
        {
          userId: run.userId,
          notebookId: run.notebookId,
          ...(run.sessionId ? { sessionId: run.sessionId } : {}),
          ...(input.turnId ? { turnId: input.turnId } : {}),
          runId: run.runId,
          traceId: run.traceId,
          selectedNodeRefs: run.selectedNodeRefs,
          permissions: { read: true, write: true },
        },
      );
      const latencyMs = Date.now() - startedAt.getTime();
      await onToolLifecycleEvent?.({
        phase: "completed",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        sideEffectClass: toolDef.sideEffectClass,
        input: step.args,
        output: result,
        startedAt: startedAt.toISOString(),
        latencyMs,
      });

      yield {
        type: "tool_call_complete",
        data: { toolName: step.toolName, toolCallId: step.toolCallId, args: step.args, result },
      };

      const followup = renderToolResultText(step.toolName, result, promptContext);
      if (followup) {
        textChunks.push(followup);
        yield { type: "message_delta", data: { text: followup } };
      }
    } catch (error) {
      const failure = classifyRuntimeError(error);
      await onToolLifecycleEvent?.({
        phase: "failed",
        toolCallId: step.toolCallId,
        toolName: step.toolName,
        sideEffectClass: toolDef.sideEffectClass,
        input: step.args,
        startedAt: startedAt.toISOString(),
        latencyMs: Date.now() - startedAt.getTime(),
        code: failure.code,
        error: failure.safeMessage,
      });
      yield { type: "run_error", data: { error: failure.safeMessage, code: failure.code } };
      return;
    }
  }

  yield { type: "message_complete", data: { text: textChunks.join(""), stopReason: "end_turn" } };
  yield { type: "run_complete", data: { runId: run.runId } };
}

function planMockTutorSession(
  userMessage: string,
  context: StudyAgentPromptContext,
): {
  steps: Array<
  | { type: "text"; content: string; toolName?: never; toolCallId?: never; args?: never }
  | { type: "tool_call"; content?: never; toolName: string; toolCallId: string; args: unknown }
  >;
} {
  const lower = userMessage.toLowerCase();
  const toolCallId = () => createRuntimeId("toolcall");

  if (lower.includes("quiz")) {
    return {
      steps: [
        { type: "text", content: "I’ll create a grounded quiz draft from your notebook context. " },
        {
          type: "tool_call",
          toolName: "artifact.create_quiz",
          toolCallId: toolCallId(),
          args: {
            title: `${context.notebookTitle} quiz`,
            prompt: userMessage,
            conceptIds: context.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
            sourceNodeRefs: context.selectedNodeRefs,
            questionCount: 5,
          },
        },
      ],
    };
  }

  if (lower.includes("slope") || lower.includes("tangent") || lower.includes("secant") || lower.includes("mixing")) {
    return {
      steps: [
        {
          type: "text",
          content: "You are close: a derivative is the tangent-line slope, found as the limit of secant slopes. The formula starts with two points, but the limit is what turns the average rate into an instantaneous rate. Can you explain in your own words how the secant line becomes the tangent line?",
        },
      ],
    };
  }

  if (lower.includes("teach me") || lower.includes("topic") || lower.includes("missing a key idea")) {
    return {
      steps: [
        {
          type: "text",
          content: "The derivative measures instantaneous rate of change as the limit of average rates of change. The important distinction is that the secant-line slope uses two points, while the derivative is the tangent-line slope reached by taking the limit as the points get arbitrarily close. Can you explain in your own words whether the derivative is just slope, or whether the limit changes what kind of slope it is?",
        },
      ],
    };
  }

  if (lower.includes("flashcard") || lower.includes("flashcards")) {
    return {
      steps: [
        { type: "text", content: "I’ll create grounded flashcards from the notebook concepts in scope. " },
        {
          type: "tool_call",
          toolName: "artifact.create_flashcards",
          toolCallId: toolCallId(),
          args: {
            title: `${context.notebookTitle} flashcards`,
            prompt: userMessage,
            conceptIds: context.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
            sourceNodeRefs: context.selectedNodeRefs,
            cardCount: 8,
          },
        },
      ],
    };
  }

  if (lower.includes("concept card") || lower.includes("concept reference")) {
    return {
      steps: [
        { type: "text", content: "I’ll create a compact concept card with source grounding. " },
        {
          type: "tool_call",
          toolName: "artifact.create_concept_card",
          toolCallId: toolCallId(),
          args: {
            title: `${context.notebookTitle} concept card`,
            prompt: userMessage,
            definition: "A source-grounded definition for the selected concept.",
            whenToUse: "Use this card to recall the idea before practice or review.",
            commonConfusion: "Do not confuse the named concept with a nearby formula or example.",
            examples: ["Connect the definition to one source-backed example."],
            conceptIds: context.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
            sourceNodeRefs: context.selectedNodeRefs,
          },
        },
      ],
    };
  }

  if (lower.includes("note") || lower.includes("summary")) {
    return {
      steps: [
        { type: "text", content: "I’ll create a note draft so this can persist in the notebook. " },
        {
          type: "tool_call",
          toolName: "artifact.create_note",
          toolCallId: toolCallId(),
          args: {
            title: `${context.notebookTitle} note`,
            noteMarkdown: `## Tutor note\n\n${userMessage}`,
            sourceNodeRefs: context.selectedNodeRefs,
            blockOwnerType: "agent",
          },
        },
      ],
    };
  }

  if (lower.includes("claim")) {
    return {
      steps: [
        { type: "text", content: "I’ll turn that into a candidate claim with explicit provenance. " },
        {
          type: "tool_call",
          toolName: "wiki.propose_claim",
          toolCallId: toolCallId(),
          args: {
            claimText: userMessage,
            claimType: "tutor_proposal",
            conceptIds: context.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
            sourceRefs: context.selectedNodeRefs.filter((ref) =>
              ["source", "source_version", "chunk"].includes(ref.refType),
            ),
          },
        },
      ],
    };
  }

  if (lower.includes("study plan") || lower.includes("objective")) {
    return {
      steps: [
        { type: "text", content: "I’m checking the active study plan and curriculum first. " },
        {
          type: "tool_call",
          toolName: "study_plan.get_current",
          toolCallId: toolCallId(),
          args: {},
        },
        {
          type: "tool_call",
          toolName: "curriculum.get",
          toolCallId: toolCallId(),
          args: {},
        },
      ],
    };
  }

  if (lower.includes("graph") || lower.includes("map")) {
    return {
      steps: [
        { type: "text", content: "I’m loading the relevant graph map for this notebook. " },
        {
          type: "tool_call",
          toolName: context.selectedNodeRefs.some((ref) => ref.refType === "source")
            ? "graph.get_source_wiki_map"
            : "graph.get_study_map",
          toolCallId: toolCallId(),
          args: context.selectedNodeRefs.some((ref) => ref.refType === "source")
            ? {
                sourceIds: context.selectedNodeRefs
                  .filter((ref) => ref.refType === "source")
                  .map((ref) => ref.refId),
              }
            : {},
        },
      ],
    };
  }

  if (lower.includes("search") || lower.includes("find") || lower.includes("explain") || lower.includes("?")) {
    return {
      steps: [
        { type: "text", content: "Let me pull grounded notebook context first. " },
        {
          type: "tool_call",
          toolName: "notebook.get_context",
          toolCallId: toolCallId(),
          args: { includeRecentActivity: true },
        },
        {
          type: "tool_call",
          toolName: "wiki.search",
          toolCallId: toolCallId(),
          args: {
            query: userMessage,
            selectedNodeRefs: context.selectedNodeRefs,
            conceptIds: context.selectedNodeRefs.filter((ref) => ref.refType === "concept").map((ref) => ref.refId),
            maxResults: 5,
          },
        },
      ],
    };
  }

  return {
    steps: [
      {
        type: "text",
        content: `I'm ready to help you learn in "${context.notebookTitle}" (${context.activeMode} mode). Ask a question, request a quiz, flashcards, or note, or select graph nodes for more grounded tutoring.`,
      },
    ],
  };
}

function renderToolResultText(
  toolName: string,
  result: unknown,
  context: StudyAgentPromptContext,
): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  if (toolName === "wiki.search" && Array.isArray((result as { results?: unknown[] }).results)) {
    const rows = ((result as { results: Array<{ title: string; snippet: string }> }).results ?? []).slice(0, 3);
    if (!rows.length) {
      return "I didn't find strong notebook-grounded matches yet, so I may need a narrower question or a more specific selected source. ";
    }
    const summary = rows.map((row, index) => `${index + 1}. ${row.title}: ${row.snippet}`).join(" ");
    return `Here are the strongest grounded matches I found: ${summary} `;
  }

  if (toolName === "notebook.get_context") {
    const notebook = (result as { notebook?: { title?: string }; recentEvents?: unknown[] }).notebook;
    const recentEvents = (result as { recentEvents?: unknown[] }).recentEvents ?? [];
    return `I’m using notebook context from "${notebook?.title ?? context.notebookTitle}" with ${recentEvents.length} recent activity events available. `;
  }

  if (toolName === "study_plan.get_current") {
    const plan = (result as { studyPlan?: { title?: string; currentObjectiveId?: string | null } | null }).studyPlan;
    if (!plan) {
      return "There isn't an active study plan yet, so I’ll stay grounded in the current notebook context. ";
    }
    return `I found the active Live Plan "${plan.title ?? "Live Plan"}"${plan.currentObjectiveId ? ` with current objective ${plan.currentObjectiveId}` : ""}. `;
  }

  if (toolName === "curriculum.get") {
    const curriculum = (result as { curriculum?: { title?: string } | null }).curriculum;
    return curriculum ? `The active curriculum is "${curriculum.title ?? "Curriculum"}". ` : "I couldn't find an active curriculum yet. ";
  }

  if (toolName === "artifact.create_note") {
    const artifactId = (result as { artifactId?: string }).artifactId;
    return artifactId ? "I created a note draft and saved it in the Workspace. " : undefined;
  }

  if (toolName === "artifact.create_quiz") {
    const artifactId = (result as { artifactId?: string }).artifactId;
    const warnings = (result as { warnings?: Array<{ code?: string }> }).warnings ?? [];
    const isResumable = warnings.some((warning) => warning.code === "quiz_generation_deferred" || warning.code === "quiz_generation_resume_pending");
    return artifactId
      ? isResumable
        ? "I saved a resumable quiz draft so it can be finished from the saved artifact. "
        : "I created a quiz draft and saved it in the Workspace. "
      : undefined;
  }

  if (toolName === "artifact.create_flashcards") {
    const artifactId = (result as { artifactId?: string }).artifactId;
    return artifactId ? "I created a flashcards deck and saved it in the Workspace. " : undefined;
  }

  if (toolName === "wiki.propose_claim") {
    const claimId = (result as { candidateClaimId?: string }).candidateClaimId;
    return claimId ? "I proposed a candidate claim with notebook-scoped evidence. " : undefined;
  }

  if (toolName === "graph.get_study_map" || toolName === "graph.get_source_wiki_map" || toolName === "graph.get_subgraph") {
    const nodes = (result as { nodes?: unknown[] }).nodes ?? [];
    const edges = (result as { edges?: unknown[] }).edges ?? [];
    return `I loaded a graph view with ${nodes.length} nodes and ${edges.length} edges. `;
  }

  return undefined;
}

function handlePiSdkEvent(
  event: AgentSessionEvent,
  handlers: {
    onMessageDelta(text: string): void;
    onToolStart(toolName: string, toolCallId: string, args: unknown): void;
    onToolComplete(toolName: string, toolCallId: string, args: unknown, result: unknown): void;
  },
): void {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    handlers.onMessageDelta(event.assistantMessageEvent.delta);
    return;
  }

  if (event.type === "tool_execution_start") {
    handlers.onToolStart(event.toolName, event.toolCallId, event.args);
    return;
  }

  if (event.type === "tool_execution_end" && !event.isError) {
    handlers.onToolComplete(event.toolName, event.toolCallId, undefined, extractToolResult(event.result));
  }
}

function extractToolResult(result: unknown): unknown {
  if (result && typeof result === "object" && "details" in result) {
    return (result as { details?: unknown }).details ?? result;
  }
  return result;
}

function truncateToolResult(result: unknown): unknown {
  if (typeof result === "string") {
    return result.length > 1200 ? `${result.slice(0, 1197)}...` : result;
  }
  return result;
}

function extractAssistantTextFromMessages(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = extractTextFromMessage(messages[index]);
    if (candidate) return candidate;
  }
  return "";
}

function extractLastAssistantMessage(messages: unknown[]): { model?: string; usage?: unknown } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    if ((candidate as { role?: unknown }).role !== "assistant") {
      continue;
    }

    const result: { model?: string; usage?: unknown } = { usage: (candidate as { usage?: unknown }).usage };
    if (typeof (candidate as { model?: unknown }).model === "string") {
      result.model = (candidate as { model: string }).model;
    }
    return result;
  }
  return null;
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const role = (message as { role?: unknown }).role;
  if (role !== "assistant") return "";

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const type = (part as { type?: unknown }).type;
      if (type === "text") {
        return String((part as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .join("");
}

function createEventQueue<T>() {
  const items: T[] = [];
  const resolvers: Array<(value: IteratorResult<T>) => void> = [];
  const queue = { closed: false };

  return {
    queue,
    push(item: T) {
      if (queue.closed) return;
      const resolver = resolvers.shift();
      if (resolver) {
        resolver({ value: item, done: false });
      } else {
        items.push(item);
      }
    },
    end() {
      queue.closed = true;
      while (resolvers.length) {
        const resolver = resolvers.shift();
        resolver?.({ value: undefined as T, done: true });
      }
    },
    async *iterate(): AsyncGenerator<T> {
      while (true) {
        if (items.length) {
          yield items.shift() as T;
          continue;
        }
        if (queue.closed) return;
        const next = await new Promise<IteratorResult<T>>((resolve) => {
          resolvers.push(resolve);
        });
        if (next.done) return;
        yield next.value;
      }
    },
  };
}

/** @deprecated Prefer `mapPiSessionEventToAppendInput` + `appendEvent` so sequence numbers are correct. */
export function convertPiSessionEventToEnvelope(
  event: PiAgentSessionEvent,
  run: StudyAgentRuntimeRun,
): EventEnvelope | null {
  const mapped = mapPiSessionEventToAppendInput(event, run);
  if (!mapped) return null;
  return {
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    notebookId: mapped.notebookId,
    sessionId: mapped.sessionId,
    runId: mapped.runId,
    sequenceNo: 0,
    createdAt: new Date().toISOString(),
    eventType: mapped.eventType as EventEnvelope["eventType"],
    payload: mapped.payload,
  };
}
