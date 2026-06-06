import type { NodeRef } from "@studyagent/schemas";
import {
  createNoopRuntimeReadToolProvider,
  createNoopRuntimeWriteToolProvider,
  registerRuntimeToolsV1,
  registerReadToolsV1,
  registerWriteToolsV1,
  TOOL_CONTRACT_CATALOG,
  ToolRegistry,
  type RuntimeReadToolProvider,
  type RuntimeWriteToolProvider,
} from "@studyagent/tools";

export * from "./stream.js";
export * from "./ag-ui.js";
export * from "./failure.js";
export * from "./compaction.js";
export * from "./pi-session.js";
export * from "./pi-rehydration-messages.js";

export type StudyAgentPromptContext = {
  notebookId?: string;
  userId?: string;
  sessionId?: string;
  notebookTitle: string;
  activeMode: StudyAgentMode;
  selectedNodeRefs: NodeRef[];
  selectedGraphRegion?: string;
  curriculumTrackSummary?: string;
  moduleSummary?: string;
  objectiveListSummary?: string;
  sessionPlanSummary?: string;
  curriculumSummary?: string;
  studyPlanSummary?: string;
  learnerStateSummary?: string;
  learnerProgressSummary?: string;
  currentObjective?: string;
  completedObjectivesCount?: number;
  nextObjectives?: string[];
  sourceScopePolicy?: "soft_source_scope";
  openArtifact?: { id: string; artifactType: string; title: string; status: string } | null;
  weakConcepts?: string[];
  personalizationRecommendations?: string[];
  contextSelectionChunkIds?: string[];
  additionalInstructions?: string[];
};

export type StudyAgentMode = "learn" | "practice" | "revise" | "explore" | "wiki_maintenance";

export type StudyAgentPromptTemplateVersion = "v1";

export type StudyAgentPromptOptions = {
  version?: StudyAgentPromptTemplateVersion;
};

export const STUDYAGENT_TUTOR_SYSTEM_PROMPT_NAME = "studyagent-tutor-system";

export const STUDYAGENT_TUTOR_SYSTEM_PROMPT_TEMPLATE_V1 = [
  "[Role]",
  "You are StudyAgent, a source-grounded tutor and wiki steward.",
  "Teach clearly, verify claims against sources, and keep responses concise unless depth is requested.",
  "",
  "[Notebook Context]",
  "{{notebookContext}}",
  "",
  "[Curriculum-First Behavior]",
  "If curriculum, module, objective list, or session plan state is present, treat it as the default path.",
  "Start by teaching the current objective from the active session plan or curriculum path instead of asking the learner to pick a topic.",
  "If the learner asks an off-path question, answer it briefly and connect it back to the active curriculum path.",
  "Only ask a broad routing question when no usable curriculum or session-plan state exists.",
  "",
  "[Tool Rules]",
  "Use tools for notebook facts, source evidence, wiki operations, artifacts, and learning-state reads.",
  "Use the smallest sufficient tool sequence.",
  "Do not claim persistent state changes unless they happen through a tool call.",
  "Do not narrate tool planning or tool use in the learner-facing answer. Keep phrases like \"let me search\", \"let me check\", and \"now I will save\" out of the final response.",
  "If a learner asks for a named source section and retrieval warns that the requested section was not found, say the source section is not available in the indexed notebook and ask for the correct source/page instead of teaching from outside knowledge.",
  "Boundary signals are advisory: reconcile them with retrieved source evidence. If the uploaded source scope is exhausted for the learner's request, say so plainly and offer review, practice, upload-more-source, or outside-source extension; outside-source teaching requires learner consent.",
  "After tools finish, answer directly from the evidence in student-friendly language.",
  "",
  "[Citation and Provenance Rules]",
  "Do not invent citations.",
  "Prefer source-backed claims and include uncertainty when evidence is weak.",
  "",
  "[Wiki Write Rules]",
  "If a useful insight should persist, propose a wiki/artifact update via tools.",
  "Never overwrite human-owned content directly from free-form chat.",
  "",
  "[Safety Rules]",
  "Avoid fabricated facts and explicitly state uncertainty when needed.",
  "Stay within notebook scope and user intent.",
  "",
  "[Stop Conditions]",
  "Stop once the learner request is satisfied with grounded evidence.",
  "Ask a focused follow-up question only when required to continue safely or accurately.",
  "{{additionalInstructions}}",
].join("\n");

export type StudyAgentSystemPromptVariables = {
  notebookContext: string;
  additionalInstructions: string;
};

export type StudyAgentModelConfig = {
  provider: "openrouter";
  model: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  promptTemplateVersion: StudyAgentPromptTemplateVersion;
};

export type StudyAgentRuntimeBudgets = {
  maxToolCalls: number;
  maxContextTokens: number;
};

export type StudyAgentManagedPromptMetadata = {
  name: string;
  type: "text";
  version?: number;
  label?: string;
  isFallback: boolean;
  source: "langfuse" | "local_fallback";
};

export type CreateRuntimeRunInput = {
  notebookId: string;
  sessionId?: string;
  userId: string;
  traceId?: string;
  requestId?: string;
  traceparent?: string;
  managedPrompt?: StudyAgentManagedPromptMetadata;
  selectedNodeRefs?: NodeRef[];
  activeMode: StudyAgentMode;
  hostStateSignature?: string;
  modelConfig?: Partial<StudyAgentModelConfig>;
  budgets?: Partial<StudyAgentRuntimeBudgets>;
};

export type StudyAgentRuntimeRun = {
  runId: string;
  traceId: string;
  requestId?: string;
  traceparent?: string;
  managedPrompt?: StudyAgentManagedPromptMetadata;
  notebookId: string;
  sessionId?: string;
  userId: string;
  selectedNodeRefs: NodeRef[];
  activeMode: StudyAgentMode;
  hostStateSignature?: string;
  modelConfig: StudyAgentModelConfig;
  budgets: StudyAgentRuntimeBudgets;
  startedAt: string;
};

export function resolveModelConfig(input: Partial<StudyAgentModelConfig> = {}): StudyAgentModelConfig {
  return {
    provider: "openrouter",
    model: input.model ?? "openrouter/auto",
    temperature: input.temperature ?? 0.2,
    topP: input.topP ?? 0.95,
    maxOutputTokens: input.maxOutputTokens ?? 1500,
    promptTemplateVersion: input.promptTemplateVersion ?? "v1",
  };
}

export function createRuntimeRun(input: CreateRuntimeRunInput): StudyAgentRuntimeRun {
  return {
    runId: createRuntimeId("run"),
    traceId: input.traceId ?? createRuntimeId("trace"),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.traceparent ? { traceparent: input.traceparent } : {}),
    ...(input.managedPrompt ? { managedPrompt: input.managedPrompt } : {}),
    notebookId: input.notebookId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    userId: input.userId,
    selectedNodeRefs: input.selectedNodeRefs ?? [],
    activeMode: input.activeMode,
    ...(input.hostStateSignature ? { hostStateSignature: input.hostStateSignature } : {}),
    modelConfig: resolveModelConfig(input.modelConfig),
    budgets: {
      maxToolCalls: input.budgets?.maxToolCalls ?? 12,
      maxContextTokens: input.budgets?.maxContextTokens ?? 16_000,
    },
    startedAt: new Date().toISOString(),
  };
}

export function createRuntimeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export type StudyAgentHostStateSignatureOptions = {
  promptTemplateVersion?: string;
  toolContractCatalogFingerprint?: string;
};

export function buildToolContractCatalogFingerprint(): string {
  return stableHash(
    stableJsonStringify(
      TOOL_CONTRACT_CATALOG.map((contract) => ({
        name: contract.name,
        operationKind: contract.operationKind,
        providerMethod: contract.providerMethod,
        runtimeExposure: contract.runtimeExposure,
      })),
    ),
  );
}

export function buildStudyAgentHostStateSignature(
  context: StudyAgentPromptContext,
  options: StudyAgentHostStateSignatureOptions = {},
): string {
  const promptTemplateVersion = options.promptTemplateVersion ?? "v1";
  const toolContractCatalogFingerprint = options.toolContractCatalogFingerprint ?? buildToolContractCatalogFingerprint();
  const promptFingerprint = stableHash(
    stableJsonStringify({
      notebookTitle: context.notebookTitle,
      additionalInstructions: context.additionalInstructions ?? [],
    }),
  );
  return `studyagent-host-state-v2:${stableHash(
    stableJsonStringify({
      promptTemplateVersion,
      toolContractCatalogFingerprint,
      notebookId: context.notebookId ?? null,
      userId: context.userId ?? null,
      sessionId: context.sessionId ?? null,
      activeMode: context.activeMode,
      selectedNodeRefs: context.selectedNodeRefs,
      promptFingerprint,
      openArtifact: context.openArtifact
        ? {
            id: context.openArtifact.id,
            artifactType: context.openArtifact.artifactType,
          }
        : null,
    }),
  )}`;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonStringify(entry)}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildStudyAgentSystemPrompt(
  context: StudyAgentPromptContext,
  options: StudyAgentPromptOptions = {},
): string {
  const version = options.version ?? "v1";

  if (version !== "v1") {
    throw new Error(`Unsupported prompt template version: ${version}`);
  }

  const selectedRefs = context.selectedNodeRefs
    .map((ref) => `${ref.refType}:${ref.refId}`)
    .join(", ");

  return [
    "[Role]",
    "You are StudyAgent, a source-grounded tutor and wiki steward.",
    "Teach clearly, verify claims against sources, and keep responses concise unless depth is requested.",
    "",
    "[Notebook Context]",
    `Notebook: ${context.notebookTitle}`,
    `Mode: ${context.activeMode}`,
    context.selectedGraphRegion ? `Selected graph region: ${context.selectedGraphRegion}` : undefined,
    selectedRefs ? `Selected graph refs: ${selectedRefs}` : "Selected graph refs: none",
    context.curriculumTrackSummary ? `Curriculum track: ${context.curriculumTrackSummary}` : undefined,
    context.moduleSummary ? `Current module: ${context.moduleSummary}` : undefined,
    context.objectiveListSummary ? `Objective list: ${context.objectiveListSummary}` : undefined,
    context.sessionPlanSummary ? `Session plan: ${context.sessionPlanSummary}` : undefined,
    context.currentObjective ? `Current objective: ${context.currentObjective}` : undefined,
    context.completedObjectivesCount !== undefined
      ? `Completed objectives: ${context.completedObjectivesCount}`
      : undefined,
    context.nextObjectives?.length
      ? `Upcoming objectives (+1/+2): ${context.nextObjectives.join(" | ")}`
      : undefined,
    context.curriculumSummary ? `Curriculum summary: ${context.curriculumSummary}` : undefined,
    context.studyPlanSummary ? `Study plan state: ${context.studyPlanSummary}` : undefined,
    context.learnerStateSummary ? `Learner state: ${context.learnerStateSummary}` : undefined,
    "",
    "[Curriculum-First Behavior]",
    "If curriculum, module, objective list, or session plan state is present, treat it as the default path.",
    "Start by teaching the current objective from the active session plan or curriculum path instead of asking the learner to pick a topic.",
    "If the learner asks an off-path question, answer it briefly and connect it back to the active curriculum path.",
    "Only ask a broad routing question when no usable curriculum or session-plan state exists.",
    "",
    "[Tool Rules]",
    "Use tools for notebook facts, source evidence, wiki operations, artifacts, and learning-state reads.",
    "Use the smallest sufficient tool sequence.",
    "Do not claim persistent state changes unless they happen through a tool call.",
    "Do not narrate tool planning or tool use in the learner-facing answer. Keep phrases like \"let me search\", \"let me check\", and \"now I will save\" out of the final response.",
    "After tools finish, answer directly from the evidence in student-friendly language.",
    "",
    "[Citation and Provenance Rules]",
    "Do not invent citations.",
    "Prefer source-backed claims and include uncertainty when evidence is weak.",
    "",
    "[Wiki Write Rules]",
    "If a useful insight should persist, propose a wiki/artifact update via tools.",
    "Never overwrite human-owned content directly from free-form chat.",
    "",
    "[Safety Rules]",
    "Avoid fabricated facts and explicitly state uncertainty when needed.",
    "Stay within notebook scope and user intent.",
    "",
    "[Stop Conditions]",
    "Stop once the learner request is satisfied with grounded evidence.",
    "Ask a focused follow-up question only when required to continue safely or accurately.",
    ...(context.additionalInstructions ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStudyAgentSystemPromptVariables(context: StudyAgentPromptContext): StudyAgentSystemPromptVariables {
  const selectedRefs = context.selectedNodeRefs
    .map((ref) => `${ref.refType}:${ref.refId}`)
    .join(", ");
  const notebookContext = [
    `Notebook: ${context.notebookTitle}`,
    `Mode: ${context.activeMode}`,
    context.selectedGraphRegion ? `Selected graph region: ${context.selectedGraphRegion}` : undefined,
    selectedRefs ? `Selected graph refs: ${selectedRefs}` : "Selected graph refs: none",
    context.curriculumTrackSummary ? `Curriculum track: ${context.curriculumTrackSummary}` : undefined,
    context.moduleSummary ? `Current module: ${context.moduleSummary}` : undefined,
    context.objectiveListSummary ? `Objective list: ${context.objectiveListSummary}` : undefined,
    context.sessionPlanSummary ? `Session plan: ${context.sessionPlanSummary}` : undefined,
    context.currentObjective ? `Current objective: ${context.currentObjective}` : undefined,
    context.completedObjectivesCount !== undefined
      ? `Completed objectives: ${context.completedObjectivesCount}`
      : undefined,
    context.nextObjectives?.length
      ? `Upcoming objectives (+1/+2): ${context.nextObjectives.join(" | ")}`
      : undefined,
    context.curriculumSummary ? `Curriculum summary: ${context.curriculumSummary}` : undefined,
    context.studyPlanSummary ? `Study plan state: ${context.studyPlanSummary}` : undefined,
    context.learnerStateSummary ? `Learner state: ${context.learnerStateSummary}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    notebookContext,
    additionalInstructions: (context.additionalInstructions ?? []).join("\n"),
  };
}

export type CreateRuntimeToolRegistryOptions = {
  readProvider?: RuntimeReadToolProvider;
  writeProvider?: RuntimeWriteToolProvider;
};

export function createRuntimeToolRegistry(options: CreateRuntimeToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();
  registerRuntimeToolsV1(registry, {
    read: options.readProvider ?? createNoopRuntimeReadToolProvider(),
    write: options.writeProvider ?? createNoopRuntimeWriteToolProvider(),
  });
  return registry;
}
