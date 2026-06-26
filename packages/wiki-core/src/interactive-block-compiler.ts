import type {
  EvidenceRef,
  InteractiveLearningBlock,
  InteractiveLearningBlockPlan,
  NodeRef,
  PageBlockPlan,
  PageGenerationOutput,
  ReferenceSurface,
} from "@studyagent/schemas";
import {
  interactiveLearningBlockSchema,
  validateInteractiveLearningBlockPlan,
} from "@studyagent/schemas";

const ARTIFACT_BLOCK_KINDS = new Set(["quiz", "flashcard_deck", "worked_example"]);
const DEFAULT_NON_ARTIFACT_BLOCK_KINDS = new Set([
  "evidence_explorer",
  "simulation",
  "comparison",
  "concept_timeline",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function baseInteractiveBlock(
  partial: Pick<InteractiveLearningBlock, "id" | "kind" | "title" | "learningPurpose"> &
    Partial<InteractiveLearningBlock>,
): InteractiveLearningBlock {
  return {
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

function learnerEvidenceSpans(evidenceRefs: EvidenceRef[]): Array<Record<string, unknown>> {
  return evidenceRefs.map((ref) => ({
    id: ref.id,
    label: ref.label,
    excerpt: ref.text,
    sourceTitle: ref.sourceTitle ?? null,
    pageStart: ref.pageStart ?? null,
    pageEnd: ref.pageEnd ?? null,
    statementKind: ref.statementKind ?? null,
  }));
}

export function compileInteractiveBlockPlan(
  plan: InteractiveLearningBlockPlan,
  input: {
    nodeRef: NodeRef;
    surfaceType: ReferenceSurface["surfaceType"];
    blockIndex: number;
  },
): InteractiveLearningBlock | null {
  if (ARTIFACT_BLOCK_KINDS.has(plan.blockKind) && !plan.artifactRef) {
    return null;
  }
  if (
    !DEFAULT_NON_ARTIFACT_BLOCK_KINDS.has(plan.blockKind) &&
    plan.blockKind !== "evidence_explorer"
  ) {
    if (ARTIFACT_BLOCK_KINDS.has(plan.blockKind)) return null;
  }

  const validation = validateInteractiveLearningBlockPlan(plan);
  if (!validation.ok) return null;

  const blockId = `interactive_${plan.blockKind}_${input.nodeRef.refId}_${input.blockIndex}`;
  const evidenceRefs = plan.evidenceRefs ?? [];

  if (plan.blockKind === "evidence_explorer") {
    if (evidenceRefs.length === 0) return null;
    return baseInteractiveBlock({
      id: blockId,
      kind: "evidence_explorer",
      title: plan.title,
      learningPurpose: plan.learningPurpose,
      surfaceRole: plan.surfaceRole,
      nodeRef: input.nodeRef,
      conceptRefs: plan.conceptRefs,
      sourceRefs: plan.sourceRefs,
      evidenceRefs,
      content: {
        evidenceCount: evidenceRefs.length,
        surfaceType: input.surfaceType,
        evidence: learnerEvidenceSpans(evidenceRefs),
        spans: learnerEvidenceSpans(evidenceRefs),
        ...(isRecord(plan.content) ? plan.content : {}),
      },
      canonicalState: {},
      allowedActions: plan.allowedActions.length
        ? plan.allowedActions
        : ["evidence.source_span_opened", "tutor.help_requested"],
      fallbackSummary:
        plan.fallbackSummary ?? `${evidenceRefs.length} source-backed evidence item(s).`,
      quality: {
        sourceBacked: plan.sourceBacked || evidenceRefs.length > 0,
        needsReview: false,
      },
    });
  }

  if (plan.blockKind === "simulation") {
    const templateId =
      isRecord(plan.content) && typeof plan.content.simulationTemplateId === "string"
        ? plan.content.simulationTemplateId
        : "function-plotter";
    if (templateId !== "function-plotter") return null;
    return baseInteractiveBlock({
      id: blockId,
      kind: "simulation",
      title: plan.title,
      learningPurpose: plan.learningPurpose,
      surfaceRole: plan.surfaceRole,
      nodeRef: input.nodeRef,
      conceptRefs: plan.conceptRefs,
      sourceRefs: plan.sourceRefs,
      evidenceRefs,
      content: {
        simulationTemplateId: templateId,
        parameters:
          isRecord(plan.content) && isRecord(plan.content.parameters)
            ? plan.content.parameters
            : {
                expression: "x^2",
                xMin: -5,
                xMax: 5,
              },
        prompt: plan.prompt,
        pedagogyLabel: plan.sourceBacked ? "source_grounded" : "broader_pedagogy",
        ...(isRecord(plan.content) ? plan.content : {}),
      },
      canonicalState: { observations: [], parameterSnapshot: null },
      allowedActions: plan.allowedActions.length
        ? plan.allowedActions
        : ["simulation.observation_submitted", "tutor.help_requested"],
      fallbackSummary: plan.fallbackSummary ?? "Interactive simulation block.",
      quality: {
        sourceBacked: plan.sourceBacked,
        needsReview: false,
      },
    });
  }

  if (plan.blockKind === "comparison" || plan.blockKind === "concept_timeline") {
    return baseInteractiveBlock({
      id: blockId,
      kind: plan.blockKind,
      title: plan.title,
      learningPurpose: plan.learningPurpose,
      surfaceRole: plan.surfaceRole,
      nodeRef: input.nodeRef,
      conceptRefs: plan.conceptRefs,
      sourceRefs: plan.sourceRefs,
      evidenceRefs,
      content: isRecord(plan.content) ? plan.content : {},
      canonicalState: {},
      allowedActions: plan.allowedActions.length ? plan.allowedActions : ["tutor.help_requested"],
      fallbackSummary: plan.fallbackSummary ?? plan.title,
      quality: {
        sourceBacked: plan.sourceBacked || evidenceRefs.length > 0,
        needsReview: false,
      },
    });
  }

  return null;
}

export function interactiveBlockPlansFromStructuredJson(
  structuredJson: Record<string, unknown> | null | undefined,
): PageBlockPlan[] {
  const rawPlans = structuredJson?.interactiveBlockPlans;
  if (!Array.isArray(rawPlans)) return [];
  return rawPlans.filter((plan): plan is PageBlockPlan => {
    return (
      Boolean(plan) &&
      typeof plan === "object" &&
      (plan as PageBlockPlan).kind === "interactive_learning_block"
    );
  });
}

export function compilePageBlockPlansToInteractiveBlocks(
  plans: PageBlockPlan[],
  input: {
    nodeRef: NodeRef;
    surfaceType: ReferenceSurface["surfaceType"];
  },
): InteractiveLearningBlock[] {
  const blocks: InteractiveLearningBlock[] = [];
  let blockIndex = 0;
  for (const plan of plans) {
    if (plan.kind !== "interactive_learning_block") continue;
    const compiled = compileInteractiveBlockPlan(plan, {
      nodeRef: input.nodeRef,
      surfaceType: input.surfaceType,
      blockIndex,
    });
    blockIndex += 1;
    if (!compiled) continue;
    const parsed = interactiveLearningBlockSchema.safeParse(compiled);
    if (parsed.success) blocks.push(parsed.data);
  }
  return blocks;
}

export function compileBlockPlansToMarkdown(output: PageGenerationOutput): string {
  const sections: string[] = [`# ${output.title}`];
  if (output.summary?.trim()) sections.push(output.summary.trim());
  for (const block of output.blocks) {
    if (
      block.kind === "static_reference" ||
      block.kind === "source_backed_note" ||
      block.kind === "pedagogical_note"
    ) {
      if (block.markdown.trim()) sections.push(block.markdown.trim());
    }
    if (block.kind === "intent_action") {
      sections.push(`- ${block.label}${block.description ? `: ${block.description}` : ""}`);
    }
  }
  return sections.join("\n\n");
}
