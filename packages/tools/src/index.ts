import type { NodeRef, ReducerResult, SideEffectClass, ToolContext } from "@studyagent/schemas";
import { reducerResultSchema, wikiSearchResultRowSchema } from "@studyagent/schemas";
import { z } from "zod";
import {
  WRITE_TOOL_CONTRACTS,
  registerWriteToolsV1,
  type RuntimeWriteToolProvider,
} from "./writes.js";

export type ToolDefinition<Input, Output> = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<Input>;
  outputSchema: z.ZodSchema<Output>;
  sideEffectClass: SideEffectClass;
  timeoutMs: number;
  execute(input: Input, context: ToolContext): Promise<Output>;
};

export type ToolReducerExpectation = {
  required: boolean;
  mutationTypes?: readonly string[];
};

export type ToolContract<ProviderMethod extends string = string> = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  sideEffectClass: SideEffectClass;
  operationKind: "read" | "write";
  providerMethod: ProviderMethod;
  runtimeExposure: "tutor_runtime_v1";
  reducerExpectation: ToolReducerExpectation;
  timeoutMs: number;
};

export type ToolExecutionEvent = {
  eventType: "agent.tool.started" | "agent.tool.completed" | "agent.tool.failed";
  toolCallId: string;
  toolName: string;
  notebookId: string;
  sessionId?: string;
  runId: string;
  sideEffectClass: SideEffectClass;
  startedAt: string;
  latencyMs?: number;
  payload?: Record<string, unknown>;
};

export type ExecuteToolOptions = {
  toolCallId?: string;
  onEvent?: (event: ToolExecutionEvent) => Promise<void> | void;
  now?: () => Date;
};

export class ToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super("tool_not_found", `Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends ToolError {
  constructor(toolName: string, details: unknown) {
    super("tool_validation_error", `Invalid input for tool ${toolName}`);
    this.name = "ToolValidationError";
    this.cause = details;
  }
}

export class ToolTimeoutError extends ToolError {
  constructor(toolName: string, timeoutMs: number) {
    super("tool_timeout", `Tool ${toolName} timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

export class ToolReducerValidationError extends ToolError {
  constructor(toolName: string, details: unknown) {
    super("tool_reducer_validation_error", `Invalid reducer result for tool ${toolName}`);
    this.name = "ToolReducerValidationError";
    this.cause = details;
  }
}

export class ToolCatalogCoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolCatalogCoverageError";
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  register<Input, Output>(tool: ToolDefinition<Input, Output>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  get(name: string): ToolDefinition<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<unknown, unknown>[] {
    return [...this.tools.values()];
  }
}

export * from "./writes.js";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
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

function canonicalizeSourceSpanInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = { ...(value as Record<string, unknown>) };
  const sourceNodeRef = input.sourceNodeRef;
  if (sourceNodeRef && typeof sourceNodeRef === "object" && !Array.isArray(sourceNodeRef)) {
    const ref = sourceNodeRef as Record<string, unknown>;
    if (typeof ref.chunkId === "string" && !input.chunkId) input.chunkId = ref.chunkId;
    if (typeof ref.refId === "string" && !input.chunkId && !input.sourceId) input[ref.refType === "source" ? "sourceId" : "chunkId"] = ref.refId;
    if (typeof ref.sourceId === "string" && !input.sourceId) input.sourceId = ref.sourceId;
    if (typeof ref.sourceVersionId === "string" && !input.sourceVersionId) input.sourceVersionId = ref.sourceVersionId;
  }
  for (const key of ["ref", "refId", "chunkRef"]) {
    const raw = input[key];
    if (typeof raw !== "string" || input.chunkId || input.sourceId) continue;
    const id = raw.includes(":") ? raw.split(":").pop() : raw;
    if (!id) continue;
    input[id.startsWith("src_") ? "sourceId" : "chunkId"] = id;
  }
  if (typeof input.sourceId === "string" && input.sourceId.startsWith("chk_") && !input.chunkId) {
    input.chunkId = input.sourceId;
    delete input.sourceId;
  }
  return input;
}

function canonicalizeLearningStateInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = { ...(value as Record<string, unknown>) };
  if (!Array.isArray(input.conceptIds) && Array.isArray(input.requestedConceptIds)) {
    input.conceptIds = input.requestedConceptIds;
  }
  return input;
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

const nonNegativeIntSchema = z.number().int().nonnegative();
const positiveIntSchema = z.number().int().positive();

const notebookGetContextInputSchema = z.object({
  includeRecentActivity: z.boolean().default(true),
});

const notebookGetContextOutputSchema = z.object({
  notebook: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
    defaultMode: z.string().optional(),
    settings: z.record(z.string(), z.unknown()).default({}),
  }),
  selectedNodeRefs: z.array(
    z.object({
      refType: z.string().min(1),
      refId: z.string().min(1),
    }),
  ),
  recentEvents: z
    .array(
      z.object({
        id: z.string().min(1),
        eventType: z.string().min(1),
        sequenceNo: nonNegativeIntSchema,
        createdAt: z.string().datetime(),
      }),
    )
    .default([]),
});

const wikiSearchInputSchema = z.object({
  query: z.string().min(1),
  conceptIds: z.array(z.string().min(1)).default([]),
  selectedNodeRefs: z
    .array(
      z.object({
        refType: z.string().min(1),
        refId: z.string().min(1),
      }),
    )
    .default([]),
  maxResults: positiveIntSchema.max(50).default(10),
  includeGraphExpansion: z.boolean().default(false),
});

const wikiSearchOutputSchema = z.object({
  results: z.array(wikiSearchResultRowSchema),
});

const wikiGetPageInputSchema = z.object({
  pageId: z.string().min(1),
});

const wikiGetPageOutputSchema = z.object({
  page: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      pageType: z.string().min(1),
      pageKey: z.string().min(1),
      title: z.string().min(1),
      version: positiveIntSchema,
      status: z.string().min(1),
      markdown: z.string(),
      structured: z.record(z.string(), z.unknown()).default({}),
      sourceClaimIds: z.array(z.string().min(1)).default([]),
      sourceChunkIds: z.array(z.string().min(1)).default([]),
    })
    .nullable(),
});

const sourceGetSpanInputSchema = z.preprocess(canonicalizeSourceSpanInput, z.object({
  chunkId: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  sourceVersionId: z.string().min(1).optional(),
  pageStart: positiveIntSchema.optional(),
  pageEnd: positiveIntSchema.optional(),
  charStart: nonNegativeIntSchema.optional(),
  charEnd: nonNegativeIntSchema.optional(),
}));

const sourceGetSpanOutputSchema = z.object({
  text: z.string().default(""),
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1).optional(),
  pageStart: positiveIntSchema.optional(),
  pageEnd: positiveIntSchema.optional(),
  headingPath: z.array(z.string()).default([]),
  citation: z.object({
    sourceTitle: z.string().min(1),
    sourceType: z.string().min(1),
  }),
});

const graphGetSubgraphInputSchema = z.object({
  nodeRefs: z
    .array(
      z.object({
        refType: z.string().min(1),
        refId: z.string().min(1),
      }),
    )
    .min(1),
  relationTypes: z.array(z.string().min(1)).default([]),
  depth: positiveIntSchema.max(4).default(1),
  maxNodes: positiveIntSchema.max(500).default(100),
});

const graphPayloadSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      nodeType: z.string().min(1),
      ref: z.object({
        refType: z.string().min(1),
        refId: z.string().min(1),
      }),
      title: z.string().min(1),
      status: z.string().optional(),
      confidence: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      sourceNodeId: z.string().min(1),
      targetNodeId: z.string().min(1),
      relationType: z.string().min(1),
      confidence: z.number().optional(),
      weight: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  warnings: z.array(z.string()).default([]),
});

const graphGetStudyMapInputSchema = z.object({
  includeWeakConcepts: z.boolean().default(true),
  includeArtifacts: z.boolean().default(true),
});

const graphGetSourceWikiMapInputSchema = z.object({
  sourceIds: z.array(z.string().min(1)).default([]),
});

const curriculumGetInputSchema = z.object({
  curriculumId: z.string().min(1).optional(),
});

export const studentProfileGetInputSchema = z.object({
  userId: z.string().min(1).optional(),
});

const curriculumGetOutputSchema = z.object({
  curriculum: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      title: z.string().min(1),
      curriculumType: z.string().min(1),
      status: z.string().min(1),
      sourceIds: z.array(z.string().min(1)).default([]),
      objectiveIds: z.array(z.string().min(1)).default([]),
    })
    .nullable(),
});

const studentProfileOutputSchema = z.object({
  studentProfile: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      userId: z.string().min(1),
      goalSummary: z.string().nullable(),
      backgroundSummary: z.string().nullable(),
      pacePreference: z.string().nullable(),
      depthPreference: z.string().nullable(),
      examplePreferencesJson: z.record(z.string(), z.unknown()).default({}),
      assessmentPreferenceJson: z.record(z.string(), z.unknown()).default({}),
      constraintsJson: z.record(z.string(), z.unknown()).default({}),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
});

const studyPlanGetCurrentInputSchema = z.object({
  userId: z.string().min(1).optional(),
});

const studyPlanGetCurrentOutputSchema = z.object({
  studyPlan: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      userId: z.string().min(1),
      title: z.string().min(1),
      status: z.string().min(1),
      currentObjectiveId: z.string().nullable().optional(),
      upcomingObjectiveIds: z.array(z.string().min(1)).default([]),
      completedObjectiveIds: z.array(z.string().min(1)).default([]),
      weakConceptIds: z.array(z.string().min(1)).default([]),
    })
    .nullable(),
  studentProfile: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      userId: z.string().min(1),
      goalSummary: z.string().nullable(),
      backgroundSummary: z.string().nullable(),
      pacePreference: z.string().nullable(),
      depthPreference: z.string().nullable(),
      examplePreferencesJson: z.record(z.string(), z.unknown()).default({}),
      assessmentPreferenceJson: z.record(z.string(), z.unknown()).default({}),
      constraintsJson: z.record(z.string(), z.unknown()).default({}),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  curriculum: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      title: z.string().min(1),
      curriculumType: z.string().min(1),
      status: z.string().min(1),
      activeModuleId: z.string().nullable(),
      sourceIds: z.array(z.string().min(1)).default([]),
      objectiveIds: z.array(z.string().min(1)).default([]),
    })
    .nullable(),
  module: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      curriculumId: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().nullable(),
      orderIndex: z.number().int(),
      status: z.string().min(1),
      sourceRefsJson: z.array(z.unknown()).default([]),
      targetConceptIds: z.array(z.string().min(1)).default([]),
      prerequisiteModuleIds: z.array(z.string().min(1)).default([]),
      estimatedSessionCount: z.number().int(),
      coverageRequirementsJson: z.record(z.string(), z.unknown()).default({}),
      masteryGateJson: z.record(z.string(), z.unknown()).default({}),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  objectiveList: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      curriculumId: z.string().min(1),
      moduleId: z.string().min(1),
      title: z.string().min(1),
      status: z.string().min(1),
      currentObjectiveId: z.string().nullable(),
      objectiveIdsOrdered: z.array(z.string().min(1)).default([]),
      coverageSnapshotJson: z.record(z.string(), z.unknown()).default({}),
      createdByRunId: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  sessionPlan: z
    .object({
      id: z.string().min(1),
      notebookId: z.string().min(1),
      curriculumId: z.string().min(1),
      moduleId: z.string().min(1),
      objectiveListId: z.string().min(1),
      title: z.string().min(1),
      status: z.string().min(1),
      sessionGoal: z.string().nullable(),
      plannedObjectiveIds: z.array(z.string().min(1)).default([]),
      openerJson: z.record(z.string(), z.unknown()).default({}),
      diagnosticQuestionIds: z.array(z.string().min(1)).default([]),
      teachingArcIds: z.array(z.string().min(1)).default([]),
      artifactRefsJson: z.array(z.unknown()).default([]),
      exitCriteriaJson: z.record(z.string(), z.unknown()).default({}),
      recommendationReasonJson: z.record(z.string(), z.unknown()).default({}),
      createdByRunId: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
});

const learningGetStateInputSchema = z.preprocess(canonicalizeLearningStateInput, z.object({
  conceptIds: z.array(z.string().min(1)).default([]),
  userId: z.string().min(1).optional(),
}));

const learningGetStateOutputSchema = z.object({
  conceptStates: z.array(
    z.object({
      conceptId: z.string().min(1),
      masteryScore: z.number(),
      confidence: z.number().nullable().optional(),
      nextReviewAt: z.string().datetime().nullable().optional(),
      misconception: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
});

export type NotebookContextToolOutput = z.infer<typeof notebookGetContextOutputSchema>;
export type WikiSearchToolOutput = z.infer<typeof wikiSearchOutputSchema>;
export type WikiGetPageToolOutput = z.infer<typeof wikiGetPageOutputSchema>;
export type SourceGetSpanToolOutput = z.infer<typeof sourceGetSpanOutputSchema>;
export type GraphPayloadToolOutput = z.infer<typeof graphPayloadSchema>;
export type CurriculumGetToolOutput = z.infer<typeof curriculumGetOutputSchema>;
export type StudentProfileGetToolOutput = z.infer<typeof studentProfileOutputSchema>;
export type StudyPlanGetCurrentToolOutput = z.infer<typeof studyPlanGetCurrentOutputSchema>;
export type LearningGetStateToolOutput = z.infer<typeof learningGetStateOutputSchema>;

export type RuntimeReadToolProvider = {
  notebookGetContext(input: z.infer<typeof notebookGetContextInputSchema>, ctx: ToolContext): Promise<NotebookContextToolOutput>;
  wikiSearch(input: z.infer<typeof wikiSearchInputSchema>, ctx: ToolContext): Promise<WikiSearchToolOutput>;
  wikiGetPage(input: z.infer<typeof wikiGetPageInputSchema>, ctx: ToolContext): Promise<WikiGetPageToolOutput>;
  sourceGetSpan(input: z.infer<typeof sourceGetSpanInputSchema>, ctx: ToolContext): Promise<SourceGetSpanToolOutput>;
  graphGetSubgraph(input: z.infer<typeof graphGetSubgraphInputSchema>, ctx: ToolContext): Promise<GraphPayloadToolOutput>;
  graphGetStudyMap(input: z.infer<typeof graphGetStudyMapInputSchema>, ctx: ToolContext): Promise<GraphPayloadToolOutput>;
  graphGetSourceWikiMap(
    input: z.infer<typeof graphGetSourceWikiMapInputSchema>,
    ctx: ToolContext,
  ): Promise<GraphPayloadToolOutput>;
  curriculumGet(input: z.infer<typeof curriculumGetInputSchema>, ctx: ToolContext): Promise<CurriculumGetToolOutput>;
  studentProfileGet(input: z.infer<typeof studentProfileGetInputSchema>, ctx: ToolContext): Promise<StudentProfileGetToolOutput>;
  studyPlanGetCurrent(
    input: z.infer<typeof studyPlanGetCurrentInputSchema>,
    ctx: ToolContext,
  ): Promise<StudyPlanGetCurrentToolOutput>;
  learningGetState(input: z.infer<typeof learningGetStateInputSchema>, ctx: ToolContext): Promise<LearningGetStateToolOutput>;
};

export const READ_TOOL_CONTRACTS = [
  {
    name: "notebook.get_context",
    description: "Returns notebook context, selected node refs, and recent notebook activity.",
    inputSchema: notebookGetContextInputSchema,
    outputSchema: notebookGetContextOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "notebookGetContext",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
  {
    name: "wiki.search",
    description: "Runs fused wiki retrieval with provenance-aware snippets.",
    inputSchema: wikiSearchInputSchema,
    outputSchema: wikiSearchOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "wikiSearch",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 5000,
  },
  {
    name: "wiki.get_page",
    description: "Fetches a wiki page by id for reading in the current notebook.",
    inputSchema: wikiGetPageInputSchema,
    outputSchema: wikiGetPageOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "wikiGetPage",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
  {
    name: "source.get_span",
    description: "Reads source text span and citation metadata from a source/chunk reference.",
    inputSchema: sourceGetSpanInputSchema,
    outputSchema: sourceGetSpanOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "sourceGetSpan",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
  {
    name: "graph.get_subgraph",
    description: "Returns a filtered graph neighborhood around selected node refs.",
    inputSchema: graphGetSubgraphInputSchema,
    outputSchema: graphPayloadSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "graphGetSubgraph",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 5000,
  },
  {
    name: "graph.get_study_map",
    description: "Returns progression-focused graph map for objectives, sessions, and artifacts.",
    inputSchema: graphGetStudyMapInputSchema,
    outputSchema: graphPayloadSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "graphGetStudyMap",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 5000,
  },
  {
    name: "graph.get_source_wiki_map",
    description: "Returns source to section to concept to wiki-page map subgraph.",
    inputSchema: graphGetSourceWikiMapInputSchema,
    outputSchema: graphPayloadSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "graphGetSourceWikiMap",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 5000,
  },
  {
    name: "curriculum.get",
    description: "Returns active or selected curriculum overview and objective links.",
    inputSchema: curriculumGetInputSchema,
    outputSchema: curriculumGetOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "curriculumGet",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
  {
    name: "student_profile.get",
    description: "Returns the learner profile for the active notebook and user.",
    inputSchema: studentProfileGetInputSchema,
    outputSchema: studentProfileOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "studentProfileGet",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
  {
    name: "study_plan.get_current",
    description: "Returns current living study plan for a notebook/user.",
    inputSchema: studyPlanGetCurrentInputSchema,
    outputSchema: studyPlanGetCurrentOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "studyPlanGetCurrent",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
  {
    name: "learning.get_state",
    description: "Returns mastery and weak-concept signals for requested concepts.",
    inputSchema: learningGetStateInputSchema,
    outputSchema: learningGetStateOutputSchema,
    sideEffectClass: "read_only",
    operationKind: "read",
    providerMethod: "learningGetState",
    runtimeExposure: "tutor_runtime_v1",
    reducerExpectation: { required: false },
    timeoutMs: 4000,
  },
] as const satisfies readonly ToolContract<keyof RuntimeReadToolProvider & string>[];

export const TOOL_CONTRACT_CATALOG = [
  ...READ_TOOL_CONTRACTS,
  ...WRITE_TOOL_CONTRACTS,
] as const satisfies readonly ToolContract[];

export function getToolContract(toolName: string): (typeof TOOL_CONTRACT_CATALOG)[number] | undefined {
  return TOOL_CONTRACT_CATALOG.find((contract) => contract.name === toolName);
}

export function assertToolCatalogMatchesRegistry(registry: ToolRegistry): void {
  const registered = registry.list().map((tool) => tool.name).sort();
  const catalog = TOOL_CONTRACT_CATALOG.map((contract) => contract.name).sort();

  const catalogNames = catalog as string[];
  const missingContracts = registered.filter((name) => !catalogNames.includes(name));
  if (missingContracts.length > 0) {
    throw new ToolCatalogCoverageError(
      `Registered tools missing from TOOL_CONTRACT_CATALOG: ${missingContracts.join(", ")}`,
    );
  }

  const missingRegistrations = catalogNames.filter((name) => !registered.includes(name));
  if (missingRegistrations.length > 0) {
    throw new ToolCatalogCoverageError(
      `TOOL_CONTRACT_CATALOG entries missing from registry: ${missingRegistrations.join(", ")}`,
    );
  }

  if (new Set(catalog).size !== catalog.length) {
    throw new ToolCatalogCoverageError("TOOL_CONTRACT_CATALOG contains duplicate tool names");
  }
}

export function assertReadToolProviderCoverage(provider: RuntimeReadToolProvider): void {
  for (const contract of READ_TOOL_CONTRACTS) {
    assertProviderMethod(provider, contract);
  }
}

export function assertWriteToolProviderCoverage(provider: RuntimeWriteToolProvider): void {
  for (const contract of WRITE_TOOL_CONTRACTS) {
    assertProviderMethod(provider, contract);
  }
}

function assertProviderMethod(
  provider: RuntimeReadToolProvider | RuntimeWriteToolProvider,
  contract: ToolContract,
): void {
  const method = provider[contract.providerMethod as keyof typeof provider];
  if (typeof method !== "function") {
    throw new ToolCatalogCoverageError(
      `Provider missing implementation for ${contract.name} (${contract.providerMethod})`,
    );
  }
}

export function validateToolReducerOutput(toolName: string, output: unknown): ReducerResult | undefined {
  const contract = getToolContract(toolName);
  if (!contract?.reducerExpectation.required) {
    return undefined;
  }

  if (!output || typeof output !== "object") {
    throw new ToolReducerValidationError(toolName, { message: "Write tool output must be an object" });
  }

  const reducerResult = (output as { reducerResult?: unknown }).reducerResult;
  const parsed = reducerResultSchema.safeParse(reducerResult);
  if (!parsed.success) {
    throw new ToolReducerValidationError(toolName, parsed.error.flatten());
  }

  const expectedMutationTypes = "mutationTypes" in contract.reducerExpectation
    ? contract.reducerExpectation.mutationTypes
    : undefined;
  if (
    expectedMutationTypes?.length
    && !(expectedMutationTypes as readonly string[]).includes(parsed.data.mutationType)
  ) {
    throw new ToolReducerValidationError(toolName, {
      mutationType: `Expected one of: ${expectedMutationTypes.join(", ")}`,
      received: parsed.data.mutationType,
    });
  }

  return parsed.data;
}

export function extractValidatedReducerResult(output: unknown): Record<string, unknown> | undefined {
  if (!output || typeof output !== "object") {
    return undefined;
  }

  const reducerResult = (output as { reducerResult?: unknown }).reducerResult;
  const parsed = reducerResultSchema.safeParse(reducerResult);
  return parsed.success ? { ...parsed.data } : undefined;
}

export function extractValidatedReducerResultForTool(
  toolName: string,
  output: unknown,
): Record<string, unknown> | undefined {
  const validated = validateToolReducerOutput(toolName, output);
  return validated ? { ...validated } : extractValidatedReducerResult(output);
}

export function registerRuntimeToolsV1(
  registry: ToolRegistry,
  provider: {
    read: RuntimeReadToolProvider;
    write: RuntimeWriteToolProvider;
  },
): void {
  registerReadToolsV1(registry, provider.read);
  registerWriteToolsV1(registry, provider.write);
}

export function registerReadToolsV1(registry: ToolRegistry, provider: RuntimeReadToolProvider): void {
  for (const contract of READ_TOOL_CONTRACTS) {
    const execute = provider[contract.providerMethod] as (input: unknown, ctx: ToolContext) => Promise<unknown>;
    registry.register<unknown, unknown>({
      ...contract,
      execute,
    });
  }
}

export function createNoopRuntimeReadToolProvider(): RuntimeReadToolProvider {
  const emptyGraph = { nodes: [], edges: [], warnings: [] };

  return {
    async notebookGetContext(_input, ctx) {
      return {
        notebook: { id: ctx.notebookId, title: "Notebook", settings: {} },
        selectedNodeRefs: ctx.selectedNodeRefs as NodeRef[],
        recentEvents: [],
      };
    },
    async wikiSearch() {
      return { results: [] };
    },
    async wikiGetPage() {
      return { page: null };
    },
    async sourceGetSpan(input) {
      return {
        text: "",
        sourceId: input.sourceId ?? "unknown",
        sourceVersionId: input.sourceVersionId,
        pageStart: input.pageStart,
        pageEnd: input.pageEnd,
        headingPath: [],
        citation: {
          sourceTitle: "Unknown source",
          sourceType: "text",
        },
      };
    },
    async graphGetSubgraph() {
      return emptyGraph;
    },
    async graphGetStudyMap() {
      return emptyGraph;
    },
    async graphGetSourceWikiMap() {
      return emptyGraph;
    },
    async curriculumGet() {
      return { curriculum: null };
    },
    async studentProfileGet() {
      return { studentProfile: null };
    },
    async studyPlanGetCurrent() {
      return {
        studyPlan: null,
        studentProfile: null,
        curriculum: null,
        module: null,
        objectiveList: null,
        sessionPlan: null,
      };
    },
    async learningGetState() {
      return { conceptStates: [] };
    },
  };
}
