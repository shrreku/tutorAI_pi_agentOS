import type {
  InteractiveLearningBlock as SchemaInteractiveBlock,
  ReferenceBlock,
  ReferenceSurface,
} from "@studyagent/schemas";

export type InteractiveLearningBlock = SchemaInteractiveBlock & {
  simulationTemplateId?: string;
};

export type McpAppHostContext = {
  theme: "light" | "dark";
  width: number;
  height: number;
  devMode: boolean;
};

export function createTestInteractiveBlock(
  partial: Pick<InteractiveLearningBlock, "id" | "kind" | "title"> &
    Partial<InteractiveLearningBlock>,
): InteractiveLearningBlock {
  return {
    learningPurpose: "Test interactive block",
    surfaceRole: "primary",
    objectiveRefs: [],
    conceptRefs: [],
    sourceRefs: [],
    evidenceRefs: [],
    prompt: null,
    content: {},
    canonicalState: {},
    allowedActions: [],
    rendererPreference: "mcp_app",
    fallbackSummary: null,
    quality: { sourceBacked: false, needsReview: false },
    ...partial,
  };
}

export type InteractiveLearningActionEnvelope = {
  notebookId: string;
  surfaceId: string;
  blockId: string;
  nodeRef: ReferenceSurface["nodeRef"];
  artifactId?: string;
  actionName: string;
  actionPayload: unknown;
  rendererKind: "mcp_app";
  rendererVersion: string;
  sessionId?: string;
  createdAt: string;
};

function simulationTemplateIdFromContent(content: unknown): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const record = content as Record<string, unknown>;
  if (typeof record.simulationTemplateId === "string") return record.simulationTemplateId;
  if (typeof record.templateId === "string") return record.templateId.split("/").pop();
  return undefined;
}

export function toRenderableInteractiveBlock(
  block: SchemaInteractiveBlock,
): InteractiveLearningBlock {
  const templateId = simulationTemplateIdFromContent(block.content);
  if (templateId) {
    return { ...block, simulationTemplateId: templateId };
  }
  return block;
}

const INTERACTIVE_KIND_SET = new Set<string>([
  "quiz",
  "flashcard_deck",
  "worked_example",
  "evidence_explorer",
  "simulation",
  "live_plan",
  "source_reader",
  "personalization_controls",
  "dev_trace_dashboard",
]);

function isInteractiveBlockKind(value: string): boolean {
  return INTERACTIVE_KIND_SET.has(value);
}

function readInteractiveRecord(content: unknown): Record<string, unknown> | null {
  if (typeof content !== "object" || content === null) return null;
  const record = content as Record<string, unknown>;
  if (typeof record.kind === "string" && isInteractiveBlockKind(record.kind)) return record;
  if (
    record.interactiveBlock &&
    typeof record.interactiveBlock === "object" &&
    record.interactiveBlock !== null
  ) {
    const nested = record.interactiveBlock as Record<string, unknown>;
    if (typeof nested.kind === "string" && isInteractiveBlockKind(nested.kind)) return nested;
  }
  return null;
}

/** Legacy path: interactive block embedded in static ReferenceBlock.content */
export function parseInteractiveLearningBlock(
  block: ReferenceBlock,
  _surface?: ReferenceSurface,
): InteractiveLearningBlock | null {
  const fromContent = readInteractiveRecord(block.content);
  if (fromContent) {
    const parsed = toRenderableInteractiveBlock({
      id: block.id,
      kind: fromContent.kind as SchemaInteractiveBlock["kind"],
      title:
        block.title ??
        (typeof fromContent.title === "string" ? fromContent.title : "Interactive block"),
      learningPurpose:
        typeof fromContent.learningPurpose === "string"
          ? fromContent.learningPurpose
          : "Interactive practice",
      content: fromContent.content ?? fromContent,
      canonicalState: fromContent.canonicalState ?? {},
      allowedActions: Array.isArray(fromContent.allowedActions)
        ? (fromContent.allowedActions as SchemaInteractiveBlock["allowedActions"])
        : [],
      rendererPreference:
        fromContent.rendererPreference === "native" || fromContent.rendererPreference === "mcp_app"
          ? fromContent.rendererPreference
          : "mcp_app",
      fallbackSummary:
        typeof fromContent.fallbackSummary === "string" ? fromContent.fallbackSummary : null,
      surfaceRole: "primary",
      objectiveRefs: [],
      conceptRefs: [],
      sourceRefs: [],
      evidenceRefs: [],
      prompt: null,
      quality: { sourceBacked: false, needsReview: false },
    });
    return parsed;
  }

  if (isInteractiveBlockKind(block.kind)) {
    return toRenderableInteractiveBlock({
      id: block.id,
      kind: block.kind as SchemaInteractiveBlock["kind"],
      title: block.title ?? block.kind.replace(/_/g, " "),
      learningPurpose: "Interactive practice",
      content: block.content,
      canonicalState: {},
      allowedActions: [],
      rendererPreference: "mcp_app",
      fallbackSummary: null,
      surfaceRole: "primary",
      objectiveRefs: [],
      conceptRefs: [],
      sourceRefs: [],
      evidenceRefs: [],
      prompt: null,
      quality: { sourceBacked: false, needsReview: false },
    });
  }

  return null;
}
