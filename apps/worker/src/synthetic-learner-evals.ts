import { pathToFileURL } from "node:url";
import {
  loadTracerBulletSyntheticLearnerEvalMatrix,
  runSyntheticLearnerEvalSuite,
  type SyntheticLearnerEvalRunnerApi,
  type SyntheticLearnerEvalStreamEvent,
  type SyntheticLearnerModelClient,
  type SyntheticLearnerSimulatorActions,
} from "@studyagent/eval-runner";
import {
  buildSyntheticLearnerEvalMatrix,
  evaluateEvalSourceFixtureFreshness,
  nodeRefSchema,
  planSyntheticLearnerEvalRun,
  regenerateEvalSourceFixtureManifest,
  formatEvalRunPlanLine,
  evalEvidenceSnapshotSchema,
  syntheticLearnerLearnerResponseSchema,
  syntheticLearnerModelConfigSchema,
  type SyntheticLearnerActionDecision,
  type SyntheticLearnerActionObservation,
  type SyntheticLearnerAutonomyStartProfile,
  type NodeRef,
  type EvalSourceFixtureFreshnessMode,
  type SyntheticLearnerMode,
  type SyntheticLearnerModelConfig,
  type SyntheticLearnerEvalRunRecord,
  type SyntheticLearnerEvalRunPlan,
  syntheticLearnerTraitArchetypePersonas,
  syntheticLearnerTraitEstimationScenarios,
} from "@studyagent/schemas";

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

function createHttpSyntheticLearnerEvalApi(
  baseUrl: string,
  cookie?: string,
  freshnessMode: EvalSourceFixtureFreshnessMode = "strict",
): SyntheticLearnerEvalRunnerApi {
  const headers = {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/json",
  } as Record<string, string>;

  return {
    async seedNotebook({ fixture, persona, scenario }) {
      const response = await fetch(`${baseUrl}/api/v1/eval/source-fixtures/${encodeURIComponent(fixture.id)}/notebooks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `Synthetic learner: ${persona.name} / ${scenario.name}`,
          freshnessMode,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to seed eval notebook (${response.status}): ${await response.text()}`);
      }
      const payload = (await response.json()) as { notebook: { id: string }; traceRefs?: Array<{ refType: string; refId: string }> };
      const traceRefs = payload.traceRefs?.map((ref) => ({ refType: ref.refType as NodeRef["refType"], refId: ref.refId }));
      const validTraceRefs = traceRefs?.filter((ref) => nodeRefSchema.shape.refType.safeParse(ref.refType).success);
      return {
        notebookId: payload.notebook.id,
        notebookRef: { refType: "notebook", refId: payload.notebook.id },
        ...(validTraceRefs ? { traceRefs: validTraceRefs } : {}),
      };
    },
    async sendTutorTurn({ notebookId, scriptedMessage }) {
      const response = await fetch(`${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: scriptedMessage }],
          data: { activeMode: "learn", selectedNodeRefs: [], action: "prompt", sourceScopePolicy: "soft_source_scope" },
        }),
      });
      if (!response.ok) {
        throw new Error(`Tutor request failed (${response.status}): ${await response.text()}`);
      }

      const events = await readSseEvents(response, "tutor");
      const assistantMessage = collectAssistantMessage(events);
      const started = events.find((event) => event.eventType === "SESSION_STARTED");
      const runStarted = events.find((event) => event.eventType === "RUN_STARTED");
      const sessionId = response.headers.get("x-studyagent-session-id") ??
        (typeof started?.payload.sessionId === "string" ? started.payload.sessionId : `sess_${notebookId}`);
      const runId = response.headers.get("x-studyagent-run-id") ??
        (typeof runStarted?.payload.runId === "string" ? runStarted.payload.runId : `run_${notebookId}`);
      const traceEvents = await fetchTutorTraceEvents(baseUrl, headers, notebookId, sessionId, runId);
      return {
        sessionId,
        runId,
        assistantMessage,
        events: [...events, ...traceEvents],
        notebookEvents: [],
        ...(sessionId ? { traceRefs: [{ refType: "session" as const, refId: sessionId }] } : {}),
      };
    },
    async endTutorSession({ notebookId, phase = "full" }) {
      const response = await fetch(`${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/session/end`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phase }),
      });
      if (!response.ok) {
        throw new Error(`Failed to end tutor session (${response.status}): ${await response.text()}`);
      }
      const payload = (await response.json()) as { sessionId?: string };
      const sessionId = payload.sessionId ?? `sess_${notebookId}`;
      return { sessionId, events: [] };
    },
  };
}

async function readSseEvents(response: Response, source: SyntheticLearnerEvalStreamEvent["source"]): Promise<SyntheticLearnerEvalStreamEvent[]> {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = "";
  const events: SyntheticLearnerEvalStreamEvent[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseFrame(frame, source);
      if (parsed) events.push(parsed);
      boundary = buffer.indexOf("\n\n");
    }
  }
  return events;
}

function parseSseFrame(frame: string, source: SyntheticLearnerEvalStreamEvent["source"]): SyntheticLearnerEvalStreamEvent | null {
  const lines = frame.split("\n");
  const explicitEventType = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length)?.trim();
  const dataLine = lines.find((line) => line.startsWith("data: "))?.slice("data: ".length)?.trim();
  if (!dataLine) return null;
  try {
    const payload = JSON.parse(dataLine) as Record<string, unknown>;
    const eventType = explicitEventType ?? (typeof payload.type === "string" ? payload.type : undefined);
    if (!eventType) return null;
    return {
      source,
      eventType,
      payload,
    };
  } catch {
    return explicitEventType ? { source, eventType: explicitEventType, payload: { raw: dataLine } } : null;
  }
}

function collectAssistantMessage(events: SyntheticLearnerEvalStreamEvent[]): string {
  const complete = [...events].reverse().find(
    (event) => event.eventType === "TEXT_MESSAGE_END" && typeof event.payload.content === "string",
  );
  if (typeof complete?.payload.content === "string") return complete.payload.content;

  return events
    .filter((event) => event.eventType === "TEXT_MESSAGE_CONTENT")
    .map((event) => {
      if (typeof event.payload.delta === "string") return event.payload.delta;
      if (typeof event.payload.text === "string") return event.payload.text;
      if (typeof event.payload.content === "string") return event.payload.content;
      return "";
    })
    .join("");
}

async function fetchTutorTraceEvents(
  baseUrl: string,
  headers: Record<string, string>,
  notebookId: string,
  sessionId: string,
  currentRunId?: string,
): Promise<SyntheticLearnerEvalStreamEvent[]> {
  const response = await fetch(
    `${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/trace?limit=250&sessionId=${encodeURIComponent(sessionId)}`,
    { headers },
  );
  if (!response.ok) return [];
  const trace = await response.json() as {
    turns?: Array<{
      id: string;
      runs?: Array<{
        id: string;
        tools?: Array<{ id: string; toolName: string; status: string }>;
        thinking?: Array<{ eventType?: string; payload?: Record<string, unknown>; timestamp?: string }>;
        stateChanges?: Array<{ eventType: string; payload?: Record<string, unknown> }>;
        rawEvents?: Array<{ eventType?: string; payload?: Record<string, unknown>; timestamp?: string }>;
      }>;
    }>;
  };
  const events: SyntheticLearnerEvalStreamEvent[] = [];
  for (const turn of trace.turns ?? []) {
    for (const run of turn.runs ?? []) {
      if (currentRunId && run.id !== currentRunId) continue;
      for (const tool of run.tools ?? []) {
        events.push({
          source: "tutor",
          eventType: "TOOL_CALL_COMPLETE",
          payload: {
            toolName: tool.toolName,
            toolCallId: tool.id,
            status: tool.status,
          },
        });
        events.push({
          source: "runtime",
          eventType: tool.toolName,
          payload: {
            runId: run.id,
            turnId: turn.id,
            toolCallId: tool.id,
            status: tool.status,
          },
        });
      }
      const traceStates = dedupeTraceStates([...(run.rawEvents ?? []), ...(run.thinking ?? []), ...(run.stateChanges ?? [])]);
      for (const state of traceStates) {
        if (!state.eventType) continue;
        if (state.eventType === "tutor.message.delta") continue;
        events.push({
          source: "runtime",
          eventType: state.eventType,
          payload: {
            runId: run.id,
            turnId: turn.id,
            ...(state.payload ?? {}),
          },
        });
      }
    }
  }
  return events;
}

function dedupeTraceStates(
  states: Array<{ eventType?: string; payload?: Record<string, unknown>; timestamp?: string }>,
): Array<{ eventType?: string; payload?: Record<string, unknown>; timestamp?: string }> {
  const seen = new Set<string>();
  const result: Array<{ eventType?: string; payload?: Record<string, unknown>; timestamp?: string }> = [];
  for (const state of states) {
    if (!state.eventType) continue;
    const key = `${state.timestamp ?? ""}:${state.eventType}:${JSON.stringify(state.payload ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(state);
  }
  return result;
}

async function isApiHealthy(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveSyntheticLearnerApiBaseUrl(): Promise<{ baseUrl: string; fallbackUsed: boolean }> {
  const explicit = process.env.PUBLIC_API_BASE_URL?.trim() || undefined;
  const candidates = Array.from(new Set([explicit, "http://localhost:4000", "http://api:4000"].filter(Boolean) as string[]));
  for (const candidate of candidates) {
    if (await isApiHealthy(candidate)) {
      return { baseUrl: candidate, fallbackUsed: Boolean(explicit && explicit !== candidate) };
    }
  }
  return { baseUrl: explicit ?? "http://localhost:4000", fallbackUsed: false };
}

async function main() {
  const args = parseSyntheticLearnerEvalArgs(process.argv.slice(2));
  const resolvedApiBase = await resolveSyntheticLearnerApiBaseUrl();
  const baseUrl = resolvedApiBase.baseUrl;
  if (resolvedApiBase.fallbackUsed) {
    process.stderr.write(
      `WARNING: PUBLIC_API_BASE_URL=${process.env.PUBLIC_API_BASE_URL} was unreachable; using ${baseUrl}.\n`,
    );
  }
  const loadedMatrix = loadTracerBulletSyntheticLearnerEvalMatrix();
  if (args.regenerateFixture) {
    const regenerated = regenerateEvalSourceFixtureManifest({
      fixture: loadedMatrix.fixture,
      ...definedEnvOverride("generatedAt", process.env.SYNTHETIC_LEARNER_EVAL_GENERATED_AT),
      ...definedEnvOverride("ingestionPipelineVersion", process.env.SYNTHETIC_LEARNER_EVAL_INGESTION_PIPELINE_VERSION),
      ...definedEnvOverride("schemaVersion", process.env.SYNTHETIC_LEARNER_EVAL_SCHEMA_VERSION),
      ...definedEnvOverride("modelProvider", process.env.SYNTHETIC_LEARNER_EVAL_MODEL_PROVIDER),
      ...definedEnvOverride("modelName", process.env.SYNTHETIC_LEARNER_EVAL_MODEL_NAME),
      ...definedEnvOverride("sourceContentHash", process.env.SYNTHETIC_LEARNER_EVAL_SOURCE_CONTENT_HASH),
      notes: "Explicitly regenerated by the synthetic learner eval CLI.",
    });
    process.stdout.write(`${JSON.stringify(regenerated, null, 2)}\n`);
    return;
  }

  const fixture =
    args.freshnessMode === "regenerate"
      ? regenerateEvalSourceFixtureManifest({
          fixture: loadedMatrix.fixture,
          ...definedEnvOverride("generatedAt", process.env.SYNTHETIC_LEARNER_EVAL_GENERATED_AT),
          notes: "Regenerated in-memory before running synthetic learner evals.",
        })
      : loadedMatrix.fixture;
  const freshness = evaluateEvalSourceFixtureFreshness({
    fixture,
    mode: args.freshnessMode,
  });
  if (!freshness.importable) {
    throw new Error(`Fixture ${fixture.id} is stale: ${freshness.reasons.join("; ")}`);
  }
  if (freshness.status === "stale_warning") {
    process.stderr.write(`WARNING: Fixture ${fixture.id} is stale: ${freshness.reasons.join("; ")}\n`);
  }

  const api = createHttpSyntheticLearnerEvalApi(baseUrl, process.env.STUDYAGENT_API_COOKIE, args.freshnessMode);
  const simulatorModelConfig = resolveSyntheticLearnerModelConfig(process.env);
  const syntheticLearnerModel = args.learnerMode === "scripted"
    ? undefined
    : createOpenAICompatibleSyntheticLearnerModelClient(simulatorModelConfig, process.env.SYNTHETIC_LEARNER_API_KEY ?? process.env.OPENROUTER_API_KEY);
  const simulatorActions = args.learnerMode === "scenario_autonomous_llm" || args.learnerMode === "full_autonomous_llm"
    ? createHttpSyntheticLearnerSimulatorActions(baseUrl, process.env.STUDYAGENT_API_COOKIE)
    : undefined;
  const selectedScenarioIds = new Set(args.scenarioIds);
  const includeTraitScenarios = args.scenarioIds.some((id) => id.startsWith("scenario_trait_"));
  const matrix = buildSyntheticLearnerEvalMatrix({
    fixture,
    personas: includeTraitScenarios ? syntheticLearnerTraitArchetypePersonas : loadedMatrix.personas,
    scenarios: includeTraitScenarios
      ? [
          ...loadedMatrix.scenarios,
          ...syntheticLearnerTraitEstimationScenarios.filter((scenario) => selectedScenarioIds.has(scenario.id)),
        ]
      : loadedMatrix.scenarios,
  });

  const selectedScenarios = matrix.scenarios.filter((scenario) =>
    !args.scenarioIds.length || args.scenarioIds.includes(scenario.id),
  );
  const selectedPersonas = matrix.personas.filter((persona) =>
    !args.personaIds.length || args.personaIds.includes(persona.id),
  );
  const evalPlans: SyntheticLearnerEvalRunPlan[] = [];
  for (const scenario of selectedScenarios) {
    for (const persona of selectedPersonas.filter((candidate) => scenario.personaIds.includes(candidate.id))) {
      const plan = planSyntheticLearnerEvalRun({
        scenario,
        persona,
        learnerMode: args.learnerMode,
        ...(args.autonomyStartProfile ? { autonomyStartProfile: args.autonomyStartProfile } : {}),
        ...(args.learnerMode !== "scripted" ? { simulatorModelConfig } : {}),
      });
      evalPlans.push(plan);
      process.stdout.write(`${formatEvalRunPlanLine(plan)}\n`);
    }
  }

  const runId = `slrun_${fixture.id}_${selectedPersonas.length}x${selectedScenarios.length}_${Date.now()}`;
  const captureSnapshot = createHttpEvalEvidenceSnapshotClient(baseUrl, process.env.STUDYAGENT_API_COOKIE);
  let persistedRunningRunIds = new Set<string>();
  const result = await runSyntheticLearnerEvalSuite({
    matrix,
    api,
    captureSnapshot,
    ...(args.scenarioIds.length ? { scenarioIds: args.scenarioIds } : {}),
    ...(args.personaIds.length ? { personaIds: args.personaIds } : {}),
    learnerMode: args.learnerMode,
    runId,
    ...(args.learnerMode !== "scripted" ? { simulatorModelConfig } : {}),
    ...(syntheticLearnerModel ? { syntheticLearnerModel } : {}),
    ...(simulatorActions ? { simulatorActions } : {}),
    ...(args.autonomyStartProfile ? { autonomyStartProfile: args.autonomyStartProfile } : {}),
    writeTranscript: (line) => {
      process.stdout.write(`${line}\n`);
    },
    writeObservation: async (event, run) => {
      process.stdout.write(`OBS: ${JSON.stringify({ kind: event.kind, status: event.status ?? run.status, message: event.message })}\n`);
      const notebookId = run.notebookRefs.find((ref) => ref.refType === "notebook")?.refId ?? run.seededNotebookId;
      const hasSeededNotebook = Boolean(notebookId && notebookId !== fixture.seededNotebookId);
      if (!persistedRunningRunIds.has(run.id)) {
        if (!hasSeededNotebook) return;
        persistedRunningRunIds.add(run.id);
        await persistSyntheticLearnerEvalRun(baseUrl, process.env.STUDYAGENT_API_COOKIE, {
          ...run,
          evalPlans,
        });
      } else {
        await patchSyntheticLearnerEvalRun(baseUrl, process.env.STUDYAGENT_API_COOKIE, {
          id: run.id,
          status: run.status,
          observationEvents: [event],
        });
      }
    },
  });

  await persistSyntheticLearnerEvalRun(baseUrl, process.env.STUDYAGENT_API_COOKIE, {
    ...result.runRecord,
    evalPlans,
  });

  process.stdout.write(`REPORT: ${result.runRecord.status} ${result.runRecord.id}\n`);
}

function definedEnvOverride<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value ? { [key]: value } as Record<K, string> : {};
}

function parseSyntheticLearnerEvalArgs(args: string[]): {
  freshnessMode: EvalSourceFixtureFreshnessMode;
  regenerateFixture: boolean;
  scenarioIds: string[];
  personaIds: string[];
  learnerMode: SyntheticLearnerMode;
  autonomyStartProfile?: SyntheticLearnerAutonomyStartProfile;
} {
  let freshnessMode: EvalSourceFixtureFreshnessMode = "strict";
  let regenerateFixture = false;
  const scenarioIds: string[] = [];
  const personaIds: string[] = [];
  let learnerMode: SyntheticLearnerMode = "scripted";
  let autonomyStartProfile: SyntheticLearnerAutonomyStartProfile | undefined;
  for (const arg of args) {
    if (arg === "--regenerate-fixture") {
      regenerateFixture = true;
      freshnessMode = "regenerate";
      continue;
    }
    if (arg.startsWith("--freshness=")) {
      const value = arg.slice("--freshness=".length);
      if (value !== "warn" && value !== "strict" && value !== "regenerate") {
        throw new Error(`Unsupported freshness mode: ${value}`);
      }
      freshnessMode = value;
    }
    if (arg.startsWith("--scenario=")) {
      scenarioIds.push(...arg.slice("--scenario=".length).split(",").map((value) => value.trim()).filter(Boolean));
    }
    if (arg.startsWith("--persona=")) {
      personaIds.push(...arg.slice("--persona=".length).split(",").map((value) => value.trim()).filter(Boolean));
    }
    if (arg.startsWith("--learner-mode=")) {
      const value = arg.slice("--learner-mode=".length);
      if (value !== "scripted" && value !== "beat_llm" && value !== "scenario_autonomous_llm" && value !== "full_autonomous_llm") {
        throw new Error(`Unsupported learner mode: ${value}`);
      }
      learnerMode = value;
    }
    if (arg.startsWith("--autonomy-start=")) {
      const value = arg.slice("--autonomy-start=".length);
      if (value !== "naive_entry" && value !== "oriented_entry") {
        throw new Error(`Unsupported autonomy start profile: ${value}`);
      }
      autonomyStartProfile = value;
    }
  }
  if (learnerMode === "full_autonomous_llm" && !autonomyStartProfile) {
    autonomyStartProfile = "naive_entry";
  }
  return { freshnessMode, regenerateFixture, scenarioIds, personaIds, learnerMode, ...(autonomyStartProfile ? { autonomyStartProfile } : {}) };
}

function resolveSyntheticLearnerModelConfig(env: NodeJS.ProcessEnv): SyntheticLearnerModelConfig {
  const model = env.SYNTHETIC_LEARNER_MODEL ?? env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini";
  const baseUrl = env.SYNTHETIC_LEARNER_BASE_URL ?? env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const temperature = env.SYNTHETIC_LEARNER_TEMPERATURE ? Number(env.SYNTHETIC_LEARNER_TEMPERATURE) : 0.2;
  const maxActionRepairAttempts = env.SYNTHETIC_LEARNER_MAX_ACTION_REPAIR_ATTEMPTS
    ? Number.parseInt(env.SYNTHETIC_LEARNER_MAX_ACTION_REPAIR_ATTEMPTS, 10)
    : 2;
  return syntheticLearnerModelConfigSchema.parse({
    provider: "openai_compatible",
    model,
    baseUrl,
    temperature,
    maxActionRepairAttempts,
  });
}

function createOpenAICompatibleSyntheticLearnerModelClient(
  config: SyntheticLearnerModelConfig,
  apiKey: string | undefined,
): SyntheticLearnerModelClient {
  if (!apiKey) {
    throw new Error("LLM learner modes require SYNTHETIC_LEARNER_API_KEY or OPENROUTER_API_KEY.");
  }
  const endpoint = `${config.baseUrl?.replace(/\/$/, "") ?? "https://openrouter.ai/api/v1"}/chat/completions`;
  async function completeJson(prompt: string): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only valid JSON for the Synthetic Learner simulator." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Synthetic Learner model request failed (${response.status}): ${await response.text()}`);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Synthetic Learner model response did not include content.");
    return JSON.parse(content);
  }
  return {
    async generateActionDecision(input) {
      return completeJson(input.repairFeedback ? `${input.prompt}\n\nRepair feedback: ${input.repairFeedback}` : input.prompt);
    },
    async generateLearnerResponse(input) {
      return syntheticLearnerLearnerResponseSchema.parse(await completeJson(input.prompt));
    },
  };
}

function createHttpSyntheticLearnerSimulatorActions(baseUrl: string, cookie?: string): SyntheticLearnerSimulatorActions {
  const headers = {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/json",
  } as Record<string, string>;

  return {
    async execute({ notebookId, decision }): Promise<SyntheticLearnerActionObservation> {
      if (decision.action === "session.finish") {
        return { action: decision.action, status: "finished", summary: decision.finishReason ?? "Synthetic Learner finished the session.", data: {}, evidenceRefs: [] };
      }
      if (decision.action === "artifact.list") {
        const response = await fetch(`${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts`, { headers });
        if (!response.ok) return failedObservation(decision, `artifact.list failed (${response.status})`);
        const payload = await response.json() as { artifacts?: Array<{ id: string; title: string; artifactType: string; status: string }> };
        return {
          action: decision.action,
          status: "ok",
          summary: `Listed ${payload.artifacts?.length ?? 0} learner-visible artifacts.`,
          data: { artifacts: payload.artifacts ?? [], count: payload.artifacts?.length ?? 0 },
          evidenceRefs: (payload.artifacts ?? []).map((artifact) => ({ refType: "artifact" as const, refId: artifact.id })),
        };
      }
      if (decision.action === "artifact.view") {
        if (!decision.artifactId) return failedObservation(decision, "artifact.view requires artifactId.");
        const response = await fetch(`${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(decision.artifactId)}`, { headers });
        if (!response.ok) return failedObservation(decision, `artifact.view failed (${response.status})`);
        const payload = await response.json() as { artifact?: unknown };
        return {
          action: decision.action,
          status: "ok",
          summary: `Viewed artifact ${decision.artifactId}.`,
          data: { artifact: payload.artifact },
          evidenceRefs: [{ refType: "artifact", refId: decision.artifactId }],
        };
      }
      if (decision.action === "quiz.answer") {
        if (!decision.artifactId || !decision.questionId || !decision.answer) return failedObservation(decision, "quiz.answer requires artifactId, questionId, and answer.");
        const response = await fetch(`${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(decision.artifactId)}/quiz-attempts`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            questionId: decision.questionId,
            answer: decision.answer,
            isCorrect: decision.isCorrect ?? false,
            ...(decision.score !== undefined ? { score: decision.score } : {}),
            ...(decision.conceptIds.length ? { conceptIds: decision.conceptIds } : {}),
            ...(decision.explanation ? { explanation: decision.explanation } : {}),
          }),
        });
        if (!response.ok) return failedObservation(decision, `quiz.answer failed (${response.status})`);
        const payload = await response.json() as { attemptId?: string };
        return {
          action: decision.action,
          status: "ok",
          summary: `Submitted quiz answer for ${decision.questionId}.`,
          data: payload as Record<string, unknown>,
          evidenceRefs: [
            { refType: "artifact", refId: decision.artifactId },
            ...(payload.attemptId ? [{ refType: "turn" as const, refId: payload.attemptId }] : []),
          ],
        };
      }
      if (decision.action === "artifact.feedback") {
        return {
          action: decision.action,
          status: "ok",
          summary: "Recorded simulator artifact feedback in Eval Run evidence.",
          data: {
            artifactId: decision.artifactId,
            usefulness: decision.usefulness,
            difficulty: decision.difficulty,
            confusion: decision.confusion,
            sourceGrounding: decision.sourceGrounding,
          },
          evidenceRefs: decision.artifactId ? [{ refType: "artifact", refId: decision.artifactId }] : [],
        };
      }
      return { action: decision.action, status: "ok", summary: "Chat response selected.", data: {}, evidenceRefs: [] };
    },
  };
}

function failedObservation(decision: SyntheticLearnerActionDecision, summary: string): SyntheticLearnerActionObservation {
  return {
    action: decision.action,
    status: "failed",
    summary,
    data: {},
    evidenceRefs: decision.artifactId ? [{ refType: "artifact", refId: decision.artifactId }] : [],
  };
}

async function persistSyntheticLearnerEvalRun(baseUrl: string, cookie: string | undefined, run: unknown): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/eval/runs`, {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(run),
  });
  if (!response.ok) {
    throw new Error(`Failed to persist eval run (${response.status}): ${await response.text()}`);
  }
}

function createHttpEvalEvidenceSnapshotClient(baseUrl: string, cookie?: string) {
  const headers = {
    ...(cookie ? { cookie } : {}),
  } as Record<string, string>;

  return async (input: { notebookId: string; snapshotId: string }) => {
    const response = await fetch(
      `${baseUrl}/api/v1/eval/notebooks/${encodeURIComponent(input.notebookId)}/evidence-snapshot?snapshotId=${encodeURIComponent(input.snapshotId)}`,
      { headers },
    );
    if (!response.ok) {
      throw new Error(`Failed to capture eval evidence snapshot (${response.status}): ${await response.text()}`);
    }
    const payload = (await response.json()) as { snapshot: unknown };
    return evalEvidenceSnapshotSchema.parse(payload.snapshot);
  };
}

async function patchSyntheticLearnerEvalRun(
  baseUrl: string,
  cookie: string | undefined,
  run: SyntheticLearnerEvalRunRecord | Pick<SyntheticLearnerEvalRunRecord, "id" | "status" | "observationEvents">,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/eval/runs/${encodeURIComponent(run.id)}`, {
    method: "PATCH",
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(run),
  });
  if (!response.ok) {
    throw new Error(`Failed to patch live eval run (${response.status}): ${await response.text()}`);
  }
}

export { patchSyntheticLearnerEvalRun, persistSyntheticLearnerEvalRun };

if (isMain) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
