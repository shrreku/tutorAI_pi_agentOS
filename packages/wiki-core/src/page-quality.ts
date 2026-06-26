import {
  type InteractiveLearningBlockPlan,
  type PageGenerationOutput,
  type PageQualityIssue,
  pageGenerationOutputSchema,
  validateInteractiveLearningBlockPlan,
} from "@studyagent/schemas";
import { compileBlockPlansToMarkdown } from "./interactive-block-compiler.js";
import { extractHumanBlocks, mergeAgentMarkdownWithHumanBlocks } from "./page-blocks.js";

const DEBUG_METADATA_PATTERNS = [
  /`clm_[a-z0-9]+`/i,
  /\bconfidence\s*[:=]\s*0?\.\d+/i,
  /\bextraction_stats\b/i,
  /\bcandidate_claim\b/i,
  /\bpipeline_metadata\b/i,
];

const ARTIFACT_BLOCK_KINDS = new Set(["quiz", "flashcard_deck", "worked_example"]);

const REQUIRED_CONCEPT_SECTIONS = [
  "definition",
  "intuition",
  "formal",
  "examples",
  "confusions",
  "source",
] as const;

const REQUIRED_TOPIC_SECTIONS = ["overview", "why", "key concepts", "source"] as const;

export type QualityGateContext = {
  pageType?: "concept" | "topic";
  supportedClaimIds?: Set<string>;
  supportedChunkIds?: Set<string>;
  priorHumanMarkdown?: string;
};

export type QualityGateResult = {
  passed: boolean;
  issues: PageQualityIssue[];
};

export type QualityRepairDecision = {
  shouldAttemptRepair: boolean;
  repairHint: string | null;
};

export function validatePolishedPage(output: unknown): PageGenerationOutput {
  return pageGenerationOutputSchema.parse(output);
}

function sectionKey(value: string): string {
  return value.trim().toLowerCase();
}

function markdownHasSection(markdown: string, needles: readonly string[]): boolean {
  const normalized = markdown.toLowerCase();
  return needles.some((needle) => normalized.includes(sectionKey(needle)));
}

function learnerFacingMarkdown(output: PageGenerationOutput, context: QualityGateContext): string {
  const generated = output.markdown?.trim() || compileBlockPlansToMarkdown(output);
  if (!context.priorHumanMarkdown) return generated;
  const preserved = extractHumanBlocks(context.priorHumanMarkdown);
  return mergeAgentMarkdownWithHumanBlocks(generated, preserved);
}

function validateInteractivePlan(
  plan: InteractiveLearningBlockPlan,
  blockIndex: number,
  issues: PageQualityIssue[],
): void {
  const validation = validateInteractiveLearningBlockPlan(plan);
  if (!validation.ok) {
    issues.push({
      code: "invalid_block_plan",
      message: validation.error,
      severity: "error",
      blockIndex,
    });
  }
  if (ARTIFACT_BLOCK_KINDS.has(plan.blockKind) && !plan.artifactRef) {
    issues.push({
      code: "artifact_block_without_ref",
      message: `Block kind "${plan.blockKind}" requires artifactRef.`,
      severity: "error",
      blockIndex,
    });
  }
  if (
    plan.blockKind === "quiz" ||
    plan.blockKind === "flashcard_deck" ||
    plan.blockKind === "worked_example"
  ) {
    issues.push({
      code: "unsupported_generated_block",
      message: `Generated ${plan.blockKind} blocks must be artifact-backed.`,
      severity: "error",
      blockIndex,
    });
  }
  for (const action of plan.allowedActions) {
    if (
      action === "quiz.answer_submitted" ||
      action === "flashcard.review_rated" ||
      action === "worked_example.step_answered"
    ) {
      issues.push({
        code: "unsupported_action",
        message: `Action "${action}" is not allowed on generated page blocks.`,
        severity: "error",
        blockIndex,
      });
    }
  }
}

function validateEvidenceOwnership(
  block: PageGenerationOutput["blocks"][number],
  blockIndex: number,
  context: QualityGateContext,
  issues: PageQualityIssue[],
): void {
  if (!("evidenceRefs" in block) || !Array.isArray(block.evidenceRefs)) return;
  for (const ref of block.evidenceRefs) {
    if (
      ref.kind === "claim" &&
      context.supportedClaimIds &&
      !context.supportedClaimIds.has(ref.id)
    ) {
      issues.push({
        code: "unsupported_evidence_ref",
        message: `Evidence ref ${ref.id} is not a supported claim for this page.`,
        severity: "error",
        blockIndex,
      });
    }
    if (
      ref.kind === "chunk" &&
      context.supportedChunkIds &&
      !context.supportedChunkIds.has(ref.id)
    ) {
      issues.push({
        code: "unsupported_evidence_ref",
        message: `Evidence ref ${ref.id} is not a supported chunk for this page.`,
        severity: "error",
        blockIndex,
      });
    }
  }
}

export function runQualityGates(
  output: PageGenerationOutput,
  context: QualityGateContext = {},
): QualityGateResult {
  const issues: PageQualityIssue[] = [];
  const markdown = learnerFacingMarkdown(output, context);
  const hasSourceBackedBlocks = output.blocks.some((block) => block.kind === "source_backed_note");

  for (const pattern of DEBUG_METADATA_PATTERNS) {
    if (pattern.test(markdown)) {
      issues.push({
        code: "learner_unsafe_metadata",
        message: "Polished page contains learner-visible debug metadata.",
        severity: "error",
      });
      break;
    }
  }

  const requiredSections =
    context.pageType === "topic" ? REQUIRED_TOPIC_SECTIONS : REQUIRED_CONCEPT_SECTIONS;
  for (const section of requiredSections) {
    if (!markdownHasSection(markdown, [section])) {
      issues.push({
        code: "missing_section",
        message: `Missing required section for ${context.pageType ?? "concept"} page: ${section}.`,
        severity: markdown.length > 400 ? "warning" : "error",
        section,
      });
    }
  }

  for (const [index, block] of output.blocks.entries()) {
    if (block.kind === "source_backed_note" && block.evidenceRefs.length === 0) {
      issues.push({
        code: "missing_citations",
        message: "Source-backed note block is missing Evidence refs.",
        severity: "error",
      });
    }
    if (
      block.kind === "source_backed_note" &&
      block.evidenceRefs.length > 0 &&
      block.evidenceRefs.every((ref) => ref.statementKind === "generated")
    ) {
      issues.push({
        code: "missing_source_backing",
        message: "Source-backed note block only cites generated Evidence refs.",
        severity: "error",
        blockIndex: index,
      });
    }
    validateEvidenceOwnership(block, index, context, issues);
    if (block.kind === "interactive_learning_block") {
      validateInteractivePlan(block, index, issues);
    }
  }

  if (hasSourceBackedBlocks && Object.keys(output.citationsBySection).length === 0) {
    issues.push({
      code: "missing_section_citations",
      message: "Source-backed page blocks require section-level citations.",
      severity: "error",
      section: "source",
    });
  }

  if (context.supportedClaimIds) {
    for (const [section, claimIds] of Object.entries(output.citationsBySection)) {
      for (const claimId of claimIds) {
        if (!context.supportedClaimIds.has(claimId)) {
          issues.push({
            code: "unsupported_source_claim",
            message: `Citation references unsupported claim ${claimId} in section ${section}.`,
            severity: "error",
            section,
          });
        }
      }
    }
  }

  const passed = issues.every((issue) => issue.severity !== "error");
  return { passed, issues };
}

const REPAIRABLE_ISSUE_CODES = new Set([
  "missing_citations",
  "missing_section_citations",
  "missing_source_backing",
  "unsupported_evidence_ref",
  "missing_section",
  "invalid_block_plan",
  "unsupported_action",
]);

export function decideQualityRepair(issues: PageQualityIssue[]): QualityRepairDecision {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length === 0) {
    return { shouldAttemptRepair: false, repairHint: null };
  }

  const repairable = errors.every((issue) => REPAIRABLE_ISSUE_CODES.has(issue.code));
  if (!repairable || errors.length > 4) {
    return { shouldAttemptRepair: false, repairHint: null };
  }

  return {
    shouldAttemptRepair: true,
    repairHint: errors.map((issue) => issue.message).join(" | "),
  };
}
