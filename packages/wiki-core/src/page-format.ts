import type { EvidenceRef, GenerationMode, PageReadiness } from "@studyagent/schemas";
import { extractHumanBlocks, mergeAgentMarkdownWithHumanBlocks, type HumanBlock } from "./page-blocks.js";
import { derivePageReadiness } from "./page-readiness.js";

export type HeuristicPageResult = {
  markdown: string;
  readiness: PageReadiness;
  generationMode: GenerationMode;
  structuredJson: Record<string, unknown>;
};

type ClaimBullet = {
  text: string;
  confidence: number;
};

type NamedRef = {
  id: string;
  name: string;
};

function bulletList(items: string[], emptyMessage: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : emptyMessage;
}

function readinessQuote(label: string): string {
  return `> ${label}\n`;
}

function classifyClaims(claims: ClaimBullet[]) {
  return {
    definition: claims.filter((claim) => /definition|define|means|refers to/i.test(claim.text)),
    formula: claims.filter((claim) => /formula|equation|proportional|equals|=|\\frac|\\Delta|\\partial/i.test(claim.text)),
    example: claims.filter((claim) => /example|application|used|appl|case study/i.test(claim.text)),
    misconception: claims.filter((claim) => /not|only|except|unlike|misconception|confus/i.test(claim.text)),
    general: claims.filter((claim) => claim.confidence >= 0.45),
  };
}

function backedClaims(claims: ClaimBullet[]): ClaimBullet[] {
  return claims.filter((claim) => claim.confidence >= 0.45);
}

function mergeWithHumanBlocks(agentMarkdown: string, existingMarkdown?: string): string {
  if (!existingMarkdown) return agentMarkdown.trim();
  const preserved = extractHumanBlocks(existingMarkdown);
  return mergeAgentMarkdownWithHumanBlocks(agentMarkdown, preserved);
}

function buildEvidenceExplorerPlan(evidenceRefs: EvidenceRef[]) {
  if (evidenceRefs.length === 0) return null;
  return {
    kind: "interactive_learning_block" as const,
    blockKind: "evidence_explorer" as const,
    title: "Inspect Evidence",
    learningPurpose: "Open source excerpts that support this page.",
    content: { evidenceCount: evidenceRefs.length },
    allowedActions: ["evidence.source_span_opened", "tutor.help_requested"],
    evidenceRefs,
    sourceBacked: true,
  };
}

function heuristicReadiness(evidenceCount: number, backedClaimCount: number): PageReadiness {
  return derivePageReadiness({
    evidenceCount,
    generationMode: "heuristic",
    qualityScore: backedClaimCount > 0 ? Math.min(0.7, 0.35 + backedClaimCount * 0.1) : null,
  });
}

export type HeuristicCurriculumPageInput = {
  curriculumTitle: string;
  purpose?: string;
  sourceTitles: string[];
  modules: Array<{ moduleId: string; title: string; summary?: string }>;
  activeModuleId?: string;
  existingMarkdown?: string;
};

export function buildHeuristicCurriculumPageMarkdown(input: HeuristicCurriculumPageInput): HeuristicPageResult {
  const activeModule = input.modules.find((module) => module.moduleId === input.activeModuleId) ?? input.modules[0];
  const readiness = heuristicReadiness(input.sourceTitles.length, input.modules.length);
  const readinessLabel =
    readiness === "ready_to_study" ? "Ready to study" : readiness === "needs_more_source_support" ? "Needs more source support" : "Still improving";

  const agentMarkdown = [
    `# ${input.curriculumTitle}`,
    readinessQuote(readinessLabel),
    "## Path purpose",
    input.purpose?.trim() || "This curriculum organizes your uploaded sources into a guided study path.",
    "",
    "## Source coverage",
    bulletList(
      input.sourceTitles.map((title) => title.trim()).filter(Boolean),
      "Needs more source support — upload or link a source to begin.",
    ),
    "",
    "## Module outline",
    bulletList(
      input.modules.map((module) => {
        const summary = module.summary?.trim();
        return summary ? `${module.title}: ${summary}` : module.title;
      }),
      "Still improving — module outline will appear after ingestion completes.",
    ),
    "",
    "## Active module",
    activeModule
      ? `- ${activeModule.title}${activeModule.summary ? `: ${activeModule.summary}` : ""}`
      : "- Still improving — no active module selected yet.",
    "",
    "## Next action",
    "- Start or resume studying from the active module.",
    "- Open module pages to see topics and concepts for each section.",
    "- Ask the tutor to explain how this path fits your current goal.",
  ].join("\n");

  const markdown = mergeWithHumanBlocks(agentMarkdown, input.existingMarkdown);
  return {
    markdown,
    readiness,
    generationMode: "heuristic",
    structuredJson: {
      pageType: "curriculum",
      activeModuleId: activeModule?.moduleId ?? null,
      moduleIds: input.modules.map((module) => module.moduleId),
      sourceCount: input.sourceTitles.length,
    },
  };
}

export type HeuristicModulePageInput = {
  moduleTitle: string;
  summary?: string;
  sourceSections: string[];
  topics: NamedRef[];
  concepts: NamedRef[];
  objectives?: Array<{ id: string; title: string; deepBuilt?: boolean }>;
  existingMarkdown?: string;
};

export function buildHeuristicModulePageMarkdown(input: HeuristicModulePageInput): HeuristicPageResult {
  const evidenceCount = input.sourceSections.length + input.concepts.length;
  const readiness = heuristicReadiness(evidenceCount, input.topics.length);
  const readinessLabel =
    readiness === "needs_more_source_support" ? "Needs more source support" : "Still improving";
  const deepBuiltObjectives = (input.objectives ?? []).filter((objective) => objective.deepBuilt);
  const outlineObjectives = (input.objectives ?? []).filter((objective) => !objective.deepBuilt);

  const agentMarkdown = [
    `# ${input.moduleTitle}`,
    readinessQuote(readinessLabel),
    "## What this module teaches",
    input.summary?.trim() || "Still improving — this module summary will deepen as generation completes.",
    "",
    "## Source coverage",
    bulletList(
      input.sourceSections.map((section) => section.trim()).filter(Boolean),
      "Needs more source support — no source sections mapped yet.",
    ),
    "",
    "## Key topics",
    bulletList(
      input.topics.map((topic) => topic.name),
      "Still improving — topic pages will appear from source headings and planning.",
    ),
    "",
    "## Key concepts",
    bulletList(
      input.concepts.map((concept) => concept.name),
      "Still improving — concept pages will appear as concepts are discovered.",
    ),
    "",
    "## Objectives",
    deepBuiltObjectives.length > 0
      ? bulletList(
          deepBuiltObjectives.map((objective) => objective.title),
          "No deep-built objectives yet.",
        )
      : [
          "Outline only — objectives will deepen when this module is built.",
          bulletList(
            outlineObjectives.map((objective) => objective.title),
            "Still improving — objective details will appear when this module is built.",
          ),
        ].join("\n"),
    "",
    "## Next action",
    "- Open a topic page to study the core ideas in this module.",
    "- Ask the tutor which concept to focus on first.",
  ].join("\n");

  const markdown = mergeWithHumanBlocks(agentMarkdown, input.existingMarkdown);
  return {
    markdown,
    readiness,
    generationMode: "heuristic",
    structuredJson: {
      pageType: "module",
      topicIds: input.topics.map((topic) => topic.id),
      conceptIds: input.concepts.map((concept) => concept.id),
      objectiveStatus: deepBuiltObjectives.length > 0 ? "deep_built" : "outline_only",
    },
  };
}

export type HeuristicTopicPageInput = {
  topicTitle: string;
  overviewBullets?: string[];
  whyItMatters?: string[];
  concepts: NamedRef[];
  claims?: ClaimBullet[];
  relatedConcepts?: NamedRef[];
  evidenceRefs?: EvidenceRef[];
  existingMarkdown?: string;
};

export function buildHeuristicTopicPageMarkdown(input: HeuristicTopicPageInput): HeuristicPageResult {
  const claims = input.claims ?? [];
  const backed = backedClaims(claims);
  const evidenceRefs = input.evidenceRefs ?? [];
  const readiness = heuristicReadiness(evidenceRefs.length || backed.length, backed.length);
  const readinessLabel =
    readiness === "needs_more_source_support" ? "Needs more source support" : "Still improving";

  const overview =
    input.overviewBullets && input.overviewBullets.length > 0
      ? bulletList(input.overviewBullets, "")
      : bulletList(
          backed.slice(0, 3).map((claim) => claim.text),
          "Still improving — this topic page will grow as ingestion completes.",
        );

  const agentMarkdown = [
    `# ${input.topicTitle}`,
    readinessQuote(readinessLabel),
    "## Overview",
    overview,
    "",
    "## Why it matters",
    bulletList(
      (input.whyItMatters ?? backed.slice(0, 2).map((claim) => claim.text)).filter(Boolean),
      `This topic connects several ideas you will use across ${input.topicTitle}.`,
    ),
    "",
    "## Key concepts",
    bulletList(
      input.concepts.map((concept) => concept.name),
      "Still improving — related concept pages will appear as concepts are discovered.",
    ),
    "",
    "## Source-backed notes",
    bulletList(
      backed.map((claim) => claim.text),
      "Needs more source support — open Evidence to inspect excerpts from your source.",
    ),
    "",
    "## Related concepts",
    bulletList(
      (input.relatedConcepts ?? input.concepts).map((concept) => concept.name),
      "Still improving — related concept links will appear as the graph grows.",
    ),
    "",
    "## Review prompts",
    `- Summarize ${input.topicTitle} in three to five sentences.`,
    "- Name one assumption the source relies on for this topic.",
    "- Ask the tutor to quiz you on the weakest concept in this topic.",
    "",
    "## Evidence",
    evidenceRefs.length > 0
      ? "- Use the Evidence explorer below to inspect supporting excerpts."
      : "- Needs more source support — Evidence excerpts will appear when available.",
  ].join("\n");

  const evidencePlan = buildEvidenceExplorerPlan(evidenceRefs);
  const markdown = mergeWithHumanBlocks(agentMarkdown, input.existingMarkdown);
  return {
    markdown,
    readiness,
    generationMode: "heuristic",
    structuredJson: {
      pageType: "topic",
      conceptIds: input.concepts.map((concept) => concept.id),
      evidenceRefs,
      interactiveBlockPlans: evidencePlan ? [evidencePlan] : [],
    },
  };
}

export type HeuristicConceptPageInput = {
  conceptName: string;
  claims?: ClaimBullet[];
  relatedTopics?: NamedRef[];
  evidenceRefs?: EvidenceRef[];
  existingMarkdown?: string;
};

export function buildHeuristicConceptPageMarkdown(input: HeuristicConceptPageInput): HeuristicPageResult {
  const claims = input.claims ?? [];
  const backed = backedClaims(claims);
  const classified = classifyClaims(backed);
  const evidenceRefs = input.evidenceRefs ?? [];
  const readiness = heuristicReadiness(evidenceRefs.length || backed.length, backed.length);
  const readinessLabel =
    readiness === "needs_more_source_support" ? "Needs more source support" : "Still improving";

  const section = (heading: string, items: string[], emptyMessage: string) =>
    [`## ${heading}`, bulletList(items, emptyMessage), ""].join("\n");

  const relationshipNotes = classified.general
    .filter(
      (claim) =>
        !classified.definition.includes(claim) &&
        !classified.formula.includes(claim) &&
        !classified.example.includes(claim) &&
        !classified.misconception.includes(claim),
    )
    .slice(0, 4);

  const agentMarkdown = [
    `# ${input.conceptName}`,
    readinessQuote(readinessLabel),
    section(
      "Why it matters",
      relationshipNotes.slice(0, 2).map((claim) => claim.text),
      `This concept is part of the source learning path. Use it to connect definitions, examples, and practice involving ${input.conceptName}.`,
    ),
    section(
      "Definition",
      classified.definition.slice(0, 3).map((claim) => claim.text),
      "Still improving — ask the tutor to define this concept from your source.",
    ),
    section(
      "Intuition",
      relationshipNotes.slice(0, 2).map((claim) => claim.text),
      "Needs more source support — ask the tutor to build intuition from your selected source.",
    ),
    section(
      "Formal details",
      classified.formula.slice(0, 4).map((claim) => claim.text),
      "Still improving — no formulas or notation have been extracted yet.",
    ),
    section(
      "Examples",
      classified.example.slice(0, 3).map((claim) => claim.text),
      "Needs more source support — ask the tutor for a worked example.",
    ),
    section(
      "Common confusions",
      classified.misconception.slice(0, 3).map((claim) => claim.text),
      "No common confusions have been extracted yet.",
    ),
    section(
      "Source-backed notes",
      relationshipNotes.map((claim) => claim.text),
      "Needs more source support — open Evidence to inspect excerpts from your source.",
    ),
    section(
      "Related topics",
      (input.relatedTopics ?? []).map((topic) => topic.name),
      "Still improving — related topic links will appear as topic pages are created.",
    ),
    "## Practice prompts",
    `- Explain ${input.conceptName} in your own words using one source-backed detail.`,
    `- Give one example and one non-example of ${input.conceptName}.`,
    `- Name one common mistake someone might make with ${input.conceptName}.`,
    "",
    "## How to use this page",
    "Study these notes, then use tutor chat for teaching, checks, and connections to your current objective.",
    "",
    evidenceRefs.length > 0 ? "## Evidence\n- Use the Evidence explorer below to inspect supporting excerpts." : "",
  ]
    .filter(Boolean)
    .join("\n");

  const evidencePlan = buildEvidenceExplorerPlan(evidenceRefs);
  const markdown = mergeWithHumanBlocks(agentMarkdown, input.existingMarkdown);
  return {
    markdown,
    readiness,
    generationMode: "heuristic",
    structuredJson: {
      pageType: "concept",
      evidenceRefs,
      interactiveBlockPlans: evidencePlan ? [evidencePlan] : [],
    },
  };
}

export { type HumanBlock };
