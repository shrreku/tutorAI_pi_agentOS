import { getModel, getSupportedThinkingLevels } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  defineTool,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import {
  executeTool,
  normalizeToolInputAliases,
  ToolError,
  ToolValidationError,
  TOOL_CONTRACT_CATALOG,
  type ToolRegistry,
} from "@studyagent/tools";
import { classifyRuntimeError } from "./failure.js";
import {
  buildStudyAgentSystemPrompt,
  type StudyAgentPromptContext,
  type StudyAgentRuntimeRun,
} from "./index.js";
import { planMockTutorSessionSteps } from "./mock-tutor-plan.js";
import { getPiToolMetadata } from "./pi-tool-schema.js";
import {
  normalizeRehydrationMessagesForPiSession,
  type SimpleRehydrationMessage,
} from "./pi-rehydration-messages.js";
import { getLivePiSessions, type CachedPiSession } from "./pi-session-cache.js";

export const DEFAULT_TUTOR_MODEL_TIMEOUT_MS = 120_000;

export type PiAgentSessionConfig = {
  model: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  providerApiKey?: string;
  baseUrl?: string;
  useMock?: boolean;
  modelTimeoutMs?: number;
};

export type PiSessionAction = "prompt" | "steer" | "followUp";

export type PiAgentSessionInput = {
  run: StudyAgentRuntimeRun;
  turnId?: string;
  promptContext: StudyAgentPromptContext;
  userMessage: string;
  initialMessages?: unknown[];
  toolRegistry: ToolRegistry;
  action?: PiSessionAction;
  systemPrompt?: string;
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
  | { type: "thinking_start"; data: { runId: string; model?: string; provider?: string } }
  | { type: "thinking_delta"; data: { text: string; model?: string; provider?: string } }
  | { type: "thinking_complete"; data: { text: string; durationMs?: number; model?: string; provider?: string } }
  | { type: "narration_delta"; data: { text: string; messageIndex: number; model?: string; provider?: string } }
  | { type: "narration_complete"; data: { text: string; messageIndex: number; durationMs?: number; model?: string; provider?: string } }
  | { type: "message_delta"; data: { text: string; model?: string; provider?: string } }
  | { type: "message_complete"; data: { text: string; stopReason: string; model?: string; provider?: string } }
  | { type: "tool_call_start"; data: { toolName: string; toolCallId: string; args?: unknown; model?: string; provider?: string } }
  | { type: "tool_call_complete"; data: { toolName: string; toolCallId: string; args?: unknown; result: unknown; model?: string; provider?: string } }
  | { type: "run_complete"; data: { runId: string; usage?: unknown; model?: string; provider?: string; promptTemplateVersion?: string } }
  | {
      type: "run_error";
      data: {
        error: string;
        code: string;
        retryable?: boolean;
        details?: Record<string, unknown>;
      };
    };

function buildRuntimeToolContext(run: StudyAgentRuntimeRun, turnId?: string) {
  return {
    userId: run.userId,
    notebookId: run.notebookId,
    ...(run.contentNotebookId ? { contentNotebookId: run.contentNotebookId } : {}),
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
    ...(turnId ? { turnId } : {}),
    runId: run.runId,
    traceId: run.traceId,
    selectedNodeRefs: run.selectedNodeRefs,
    permissions: { read: true, write: true },
  } as const;
}

export async function* runStudyAgentTutorSession(input: PiAgentSessionInput): AsyncGenerator<PiAgentSessionEvent> {
  if (input.config?.useMock) {
    yield* runMockStudyAgentTutorSession(input);
    return;
  }

  const { run, promptContext, userMessage, toolRegistry } = input;
  const action = input.action ?? "prompt";
  const systemPrompt = input.systemPrompt ?? buildStudyAgentSystemPrompt(promptContext);
  const { queue, push, end, iterate } = createEventQueue<PiAgentSessionEvent>();
  let assistantText = "";
  let streamedAssistantMessageIndex = 0;
  let activeAssistantMessageIndex = 0;
  let pendingNarrationText = "";
  let thinkingText = "";
  let thinkingStartedAt: number | null = null;
  let completed = false;
  let toolCallCount = 0;
  let sawToolActivity = false;

  const toolContext = buildRuntimeToolContext(run, input.turnId);

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
  const thinkingLevel = resolveThinkingLevel(baseModel);
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
            details: {
              ...(error instanceof ToolValidationError && error.cause && typeof error.cause === "object"
                ? (error.cause as Record<string, unknown>)
                : {}),
              ...(failure.originalMessage ? { originalMessage: failure.originalMessage } : {}),
            },
          });
          throw new Error(failure.safeMessage);
        }
      },
    });
  });

  const cachedSession = run.sessionId ? getLivePiSessions().get(run.sessionId) : undefined;
  const session = cachedSession?.session
    ?? (
      await createAgentSession({
        cwd: process.cwd(),
        model,
        thinkingLevel,
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

  if (!cachedSession && Array.isArray(input.initialMessages) && input.initialMessages.length > 0) {
    const sessionState = (session as { state?: { messages?: unknown[] } }).state;
    if (sessionState && Array.isArray(sessionState.messages)) {
      sessionState.messages = normalizeRehydrationMessagesForPiSession(
        input.initialMessages as SimpleRehydrationMessage[],
        model,
      );
    }
  }

  if (run.sessionId && !cachedSession) {
    getLivePiSessions().set(run.sessionId, {
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
      onThinkingStart(runtime) {
        if (thinkingStartedAt === null) {
          thinkingStartedAt = Date.now();
          push({ type: "thinking_start", data: { runId: run.runId, ...runtime } });
        }
      },
      onThinkingDelta(text, runtime) {
        if (thinkingStartedAt === null) {
          thinkingStartedAt = Date.now();
          push({ type: "thinking_start", data: { runId: run.runId, ...runtime } });
        }
        thinkingText += text;
        push({ type: "thinking_delta", data: { text, ...runtime } });
      },
      onThinkingComplete(runtime) {
        if (thinkingStartedAt === null && thinkingText.trim().length === 0) {
          return;
        }
        push({
          type: "thinking_complete",
          data: {
            text: thinkingText,
            ...(thinkingStartedAt !== null ? { durationMs: Date.now() - thinkingStartedAt } : {}),
            ...runtime,
          },
        });
        thinkingText = "";
        thinkingStartedAt = null;
      },
      onMessageDelta(text, runtime) {
        assistantText += text;
        pendingNarrationText += text;
        push({ type: "message_delta", data: { text, ...runtime } });
      },
      onToolStart(toolName, toolCallId, args) {
        sawToolActivity = true;
        flushNarration();
        push({ type: "tool_call_start", data: { toolName, toolCallId, args } });
      },
      onToolComplete(toolName, toolCallId, args, result) {
        sawToolActivity = true;
        push({ type: "tool_call_complete", data: { toolName, toolCallId, args, result } });
      },
    });
  });

  function flushNarration(): void {
    const text = pendingNarrationText.trim();
    if (!text) {
      pendingNarrationText = "";
      return;
    }
    activeAssistantMessageIndex = streamedAssistantMessageIndex;
    push({
      type: "narration_complete",
      data: {
        text,
        messageIndex: activeAssistantMessageIndex,
      },
    });
    pendingNarrationText = "";
    assistantText = "";
    streamedAssistantMessageIndex += 1;
    activeAssistantMessageIndex = streamedAssistantMessageIndex;
  }

  const dispatch =
    action === "steer" && typeof (session as { steer?: (message: string) => Promise<void> }).steer === "function"
      ? (session as { steer: (message: string) => Promise<void> }).steer.bind(session)
      : action === "followUp" && typeof (session as { followUp?: (message: string) => Promise<void> }).followUp === "function"
        ? (session as { followUp: (message: string) => Promise<void> }).followUp.bind(session)
        : session.prompt.bind(session);

  const modelTimeoutMs = input.config?.modelTimeoutMs;
  const dispatchStartedAt = Date.now();
  const dispatchWork = dispatch(userMessage);
  void (modelTimeoutMs != null
    ? withTimeout(dispatchWork, modelTimeoutMs, "model dispatch timed out")
    : dispatchWork)
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
      if (thinkingStartedAt !== null || thinkingText.trim().length > 0) {
        push({
          type: "thinking_complete",
          data: {
            text: thinkingText,
            ...(thinkingStartedAt !== null ? { durationMs: Date.now() - thinkingStartedAt } : {}),
          },
        });
        thinkingText = "";
        thinkingStartedAt = null;
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
    .catch(async (error) => {
      if (!sawToolActivity && error instanceof Error && error.message === "model dispatch timed out") {
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
      const failure = classifyRuntimeError(error);
      push({
        type: "run_error",
        data: {
          error: failure.safeMessage,
          code: failure.code,
          retryable: failure.retryable,
          details: {
            toolCallCount,
            modelTimeoutMs,
            dispatchDurationMs: Date.now() - dispatchStartedAt,
            sawToolActivity,
            maxToolCalls: run.budgets.maxToolCalls,
            ...(failure.originalMessage ? { originalMessage: failure.originalMessage } : {}),
          },
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
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
  const fallbackRuntime = { model: "studyagent/local-fallback", provider: "local_fallback" };

  buildStudyAgentSystemPrompt(promptContext);
  if (run.sessionId && !getLivePiSessions().has(run.sessionId)) {
    getLivePiSessions().set(run.sessionId, {
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

  const plan = { steps: planMockTutorSessionSteps(userMessage, promptContext) };
  const textChunks: string[] = [];

  if (action === "steer") {
    yield { type: "narration_complete", data: { text: "[steered]", messageIndex: 0, ...fallbackRuntime } };
  } else if (action === "followUp") {
    yield { type: "narration_complete", data: { text: "[follow-up]", messageIndex: 0, ...fallbackRuntime } };
  }

  for (const step of plan.steps) {
    if (step.type === "text") {
      textChunks.push(step.content);
      yield { type: "message_delta", data: { text: step.content, ...fallbackRuntime } };
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
      const toolContext = buildRuntimeToolContext(run, input.turnId);
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
          data: { toolName: step.toolName, toolCallId: step.toolCallId, args: resumableArgs, ...fallbackRuntime },
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
          data: { toolName: step.toolName, toolCallId: step.toolCallId, args: resumableArgs, result: resumableDraft, ...fallbackRuntime },
        };
        const followup = renderToolResultText(step.toolName, resumableDraft, promptContext);
        if (followup) {
          textChunks.push(followup);
          yield { type: "narration_complete", data: { text: followup.trim(), messageIndex: 0, ...fallbackRuntime } };
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
      data: { toolName: step.toolName, toolCallId: step.toolCallId, args: step.args, ...fallbackRuntime },
    };

    try {
      const result = await executeTool(
        toolRegistry,
        step.toolName,
        step.args,
        buildRuntimeToolContext(run, input.turnId),
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
        data: { toolName: step.toolName, toolCallId: step.toolCallId, args: step.args, result, ...fallbackRuntime },
      };

      const followup = renderToolResultText(step.toolName, result, promptContext);
      if (followup) {
        textChunks.push(followup);
        yield { type: "narration_complete", data: { text: followup.trim(), messageIndex: 0, ...fallbackRuntime } };
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

  yield { type: "message_complete", data: { text: textChunks.join(""), stopReason: "end_turn", ...fallbackRuntime } };
  yield { type: "run_complete", data: { runId: run.runId, ...fallbackRuntime } };
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
    const boundarySignals = (result as { boundarySignals?: Array<{ summary?: string }> }).boundarySignals ?? [];
    if (!rows.length) {
      if (boundarySignals.length && boundarySignals[0]?.summary) {
        return `${boundarySignals[0].summary} We can review, practice, upload more source material, or continue with an outside-source extension if you want. `;
      }
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
    const boundarySignals = (result as { boundarySignals?: Array<{ summary?: string }> }).boundarySignals ?? [];
    if (!plan) {
      return "There isn't an active study plan yet, so I’ll stay grounded in the current notebook context. ";
    }
    return `I found the active Live Plan "${plan.title ?? "Live Plan"}"${plan.currentObjectiveId ? ` with current objective ${plan.currentObjectiveId}` : ""}.${boundarySignals.length && boundarySignals[0]?.summary ? ` ${boundarySignals[0].summary}` : ""} `;
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
    onThinkingStart(runtime: { model?: string; provider?: string }): void;
    onThinkingDelta(text: string, runtime: { model?: string; provider?: string }): void;
    onThinkingComplete(runtime: { model?: string; provider?: string }): void;
    onMessageDelta(text: string, runtime: { model?: string; provider?: string }): void;
    onToolStart(toolName: string, toolCallId: string, args: unknown): void;
    onToolComplete(toolName: string, toolCallId: string, args: unknown, result: unknown): void;
  },
): void {
  const runtime = extractRuntimeMetadata(event);
  if (event.type === "message_update") {
    const assistantEvent = (event as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
    if (assistantEvent?.type === "thinking_start") {
      handlers.onThinkingStart(runtime);
      return;
    }
    if (assistantEvent?.type === "thinking_delta") {
      handlers.onThinkingDelta(assistantEvent.delta ?? "", runtime);
      return;
    }
    if (assistantEvent?.type === "thinking_end") {
      handlers.onThinkingComplete(runtime);
      return;
    }
    if (assistantEvent?.type === "text_delta") {
      handlers.onMessageDelta(assistantEvent.delta ?? "", runtime);
      return;
    }
  }

  if (event.type === "thinking_level_changed") {
    handlers.onThinkingStart(runtime);
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

function resolveThinkingLevel(model: Parameters<typeof getSupportedThinkingLevels>[0]): "off" | "medium" {
  try {
    return getSupportedThinkingLevels(model).includes("medium") ? "medium" : "off";
  } catch {
    return "off";
  }
}

function extractRuntimeMetadata(event: AgentSessionEvent): { model?: string; provider?: string } {
  const record = event as unknown as Record<string, unknown>;
  if (typeof record.model === "string") {
    return {
      model: record.model,
      ...(typeof record.provider === "string" ? { provider: record.provider } : {}),
    };
  }
  return {};
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
