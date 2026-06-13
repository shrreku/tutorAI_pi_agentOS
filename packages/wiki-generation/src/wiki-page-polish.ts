import type { EvidenceRef, GenerationMode, NodeRef, PageGenerationOutput, PageReadiness } from "@studyagent/schemas";
import { generationModeSchema, pageGenerationOutputSchema, pageReadinessFromLearnerLabel } from "@studyagent/schemas";
import {
  compileBlockPlansToMarkdown,
  decideQualityRepair,
  extractHumanBlocks,
  mergeAgentMarkdownWithHumanBlocks,
  runQualityGates,
  validatePolishedPage,
  type QualityGateContext,
} from "@studyagent/wiki-core";
import {
  fetchOpenRouterJsonCompletion,
  type OpenRouterJsonClientConfig,
  type OpenRouterJsonMessage,
} from "@studyagent/llm-client";

export {
  compileInteractiveBlockPlan,
  compilePageBlockPlansToInteractiveBlocks,
  interactiveBlockPlansFromStructuredJson,
} from "@studyagent/wiki-core";

export type WikiPagePolishInput = {
  pageType: "concept" | "topic";
  title: string;
  pageKey: string;
  currentMarkdown: string;
  sourceExcerpt: string;
  evidenceRefs: EvidenceRef[];
  conceptRefs?: NodeRef[];
  sourceRefs?: NodeRef[];
  priorHumanMarkdown?: string;
  supportedClaimIds?: Set<string>;
  repairHint?: string | null;
  generationMode?: PageGenerationOutput["generationMode"];
};

export type WikiPagePolishResult = {
  output: PageGenerationOutput | null;
  qualityIssues: PageGenerationOutput["qualityIssues"];
  repaired: boolean;
  readiness: PageReadiness;
};

function normalizeReadiness(value: unknown): PageReadiness {
  if (typeof value !== "string" || !value.trim()) return "still_improving";
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "still_improving") return "still_improving";
  if (normalized === "ready_to_study") return "ready_to_study";
  if (normalized === "needs_more_source_support") return "needs_more_source_support";
  if (normalized === "needs_refresh") return "needs_refresh";
  return pageReadinessFromLearnerLabel(value);
}

function normalizeGenerationMode(value: unknown, fallback: GenerationMode): GenerationMode {
  const parsed = generationModeSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function salvageBlocksFromLooseLlmBlocks(
  blocks: unknown[],
  title: string,
  markdown: string,
): PageGenerationOutput["blocks"] {
  const lines: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const entry = block as Record<string, unknown>;
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    if (!content) continue;
    const type = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
    const level = typeof entry.level === "number" ? entry.level : null;
    if (type === "heading" && level === 1) lines.push(`# ${content}`);
    else if (type === "heading" && level === 2) lines.push(`## ${content}`);
    else if (type === "heading" && level != null) lines.push(`${"#".repeat(Math.min(level, 6))} ${content}`);
    else lines.push(content);
  }
  const compiled = lines.join("\n\n").trim();
  const resolvedMarkdown = markdown.trim() || compiled;
  if (!resolvedMarkdown) return [];
  return [{ kind: "static_reference", title, markdown: resolvedMarkdown }] as PageGenerationOutput["blocks"];
}

function normalizeBlocks(
  record: Record<string, unknown>,
  title: string,
  markdown: string,
): PageGenerationOutput["blocks"] {
  const blocks = Array.isArray(record.blocks) ? record.blocks : [];
  if (blocks.length === 0) {
    return markdown.trim()
      ? ([{ kind: "static_reference", title, markdown: markdown.trim() }] as PageGenerationOutput["blocks"])
      : [];
  }
  const first = blocks[0];
  if (first && typeof first === "object" && "kind" in (first as Record<string, unknown>)) {
    return blocks as PageGenerationOutput["blocks"];
  }
  return salvageBlocksFromLooseLlmBlocks(blocks, title, markdown);
}

function coercePolishedPageOutput(raw: unknown, input: WikiPagePolishInput): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  const markdown = typeof record.markdown === "string" ? record.markdown : "";
  const title = typeof record.title === "string" && record.title.trim() ? record.title : input.title;
  const readiness = normalizeReadiness(record.readiness ?? record.pageReadiness);
  const generationMode = normalizeGenerationMode(record.generationMode, input.generationMode ?? "llm_polished");
  return {
    title,
    pageKey: typeof record.pageKey === "string" && record.pageKey.trim() ? record.pageKey : input.pageKey,
    readiness,
    generationMode,
    blocks: normalizeBlocks(record, title, markdown),
    topicRefs: Array.isArray(record.topicRefs) ? record.topicRefs : [],
    conceptRefs: Array.isArray(record.conceptRefs) ? record.conceptRefs : input.conceptRefs ?? [],
    objectiveRefs: Array.isArray(record.objectiveRefs) ? record.objectiveRefs : [],
    sourceRefs: Array.isArray(record.sourceRefs) ? record.sourceRefs : input.sourceRefs ?? [],
    evidenceRefs: Array.isArray(record.evidenceRefs) ? record.evidenceRefs : input.evidenceRefs ?? [],
    citationsBySection:
      record.citationsBySection && typeof record.citationsBySection === "object" && !Array.isArray(record.citationsBySection)
        ? record.citationsBySection
        : {},
    qualityIssues: Array.isArray(record.qualityIssues) ? record.qualityIssues : [],
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    ...(typeof record.summary === "string" ? { summary: record.summary } : {}),
    ...(markdown.trim() ? { markdown: markdown.trim() } : {}),
  };
}
function safeValidatePolishedPage(raw: unknown, input: WikiPagePolishInput): PageGenerationOutput | null {
  try {
    return validatePolishedPage(coercePolishedPageOutput(raw, input));
  } catch {
    return markdownOnlyFallback(raw, input);
  }
}

function markdownOnlyFallback(raw: unknown, input: WikiPagePolishInput): PageGenerationOutput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const markdown = typeof record.markdown === "string" ? record.markdown.trim() : "";
  if (markdown.length < 80) return null;
  try {
    return validatePolishedPage({
      title: input.title,
      pageKey: input.pageKey,
      readiness: normalizeReadiness(record.readiness ?? record.pageReadiness),
      generationMode: input.generationMode ?? "llm_polished",
      blocks: [{ kind: "static_reference", title: input.title, markdown }],
      markdown,
    });
  } catch {
    return null;
  }
}

function polishMessages(input: WikiPagePolishInput): OpenRouterJsonMessage[] {
  const repair = input.repairHint
    ? `Repair the previous output. Fix these quality issues only: ${input.repairHint}`
    : "";
  return [
    {
      role: "system",
      content: [
        "You polish notebook wiki pages for learners.",
        "Return JSON matching PageGenerationOutput with required keys:",
        "title, pageKey, readiness, generationMode, blocks, citationsBySection.",
        "readiness must be one of: still_improving, ready_to_study, needs_more_source_support, needs_refresh.",
        "Use structured blocks with Evidence refs for source-backed sections.",
        "Only propose non-artifact interactive blocks: evidence_explorer, simulation (function-plotter template only), comparison, concept_timeline.",
        "Never output quiz, flashcard_deck, or worked_example blocks.",
        "Do not include raw claim ids, confidence scores, or pipeline metadata in learner markdown.",
        "Concept touch may link existing topic pages but must not create new topic page shells.",
        repair,
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        pageType: input.pageType,
        title: input.title,
        pageKey: input.pageKey,
        requiredOutputKeys: ["title", "pageKey", "readiness", "generationMode", "blocks", "citationsBySection"],
        currentMarkdown: input.currentMarkdown,
        sourceExcerpt: input.sourceExcerpt.slice(0, 8000),
        evidenceRefs: input.evidenceRefs,
        conceptRefs: input.conceptRefs ?? [],
        sourceRefs: input.sourceRefs ?? [],
      }),
    },
  ];
}

export async function requestWikiPagePolishJson(
  config: OpenRouterJsonClientConfig,
  input: WikiPagePolishInput,
): Promise<unknown> {
  return fetchOpenRouterJsonCompletion(config, polishMessages(input));
}

export async function polishWikiPage(
  config: OpenRouterJsonClientConfig | null,
  input: WikiPagePolishInput,
  requestJson: typeof requestWikiPagePolishJson = requestWikiPagePolishJson,
): Promise<WikiPagePolishResult> {
  if (!config?.apiKey) {
    return {
      output: null,
      qualityIssues: [{ code: "llm_unavailable", message: "LLM polish unavailable.", severity: "warning" }],
      repaired: false,
      readiness: "still_improving",
    };
  }

  const gateContext: QualityGateContext = {
    pageType: input.pageType,
    ...(input.priorHumanMarkdown ? { priorHumanMarkdown: input.priorHumanMarkdown } : {}),
    ...(input.supportedClaimIds ? { supportedClaimIds: input.supportedClaimIds } : {}),
  };

  let raw = await requestJson(config, input);
  let output = safeValidatePolishedPage(raw, input);
  if (!output) {
    return {
      output: null,
      qualityIssues: [{ code: "invalid_llm_output", message: "LLM returned an invalid page generation payload.", severity: "error" }],
      repaired: false,
      readiness: "still_improving",
    };
  }
  let gate = runQualityGates(output, gateContext);
  let repaired = false;

  if (!gate.passed) {
    const repair = decideQualityRepair(gate.issues);
    if (repair.shouldAttemptRepair) {
      raw = await requestJson(config, { ...input, repairHint: repair.repairHint });
      output = safeValidatePolishedPage(raw, input);
      if (!output) {
        return {
          output: null,
          qualityIssues: [{ code: "invalid_llm_output", message: "LLM repair returned an invalid page generation payload.", severity: "error" }],
          repaired: true,
          readiness: "still_improving",
        };
      }
      gate = runQualityGates(output, gateContext);
      repaired = true;
    }
  }

  if (!gate.passed) {
    return {
      output: null,
      qualityIssues: gate.issues,
      repaired,
      readiness: "still_improving",
    };
  }

  const markdown = output.markdown?.trim()
    ? output.markdown
    : compileBlockPlansToMarkdown(output);
  const mergedMarkdown = input.priorHumanMarkdown
    ? mergeAgentMarkdownWithHumanBlocks(markdown, extractHumanBlocks(input.priorHumanMarkdown))
    : markdown;

  const baseGenerationMode = input.generationMode ?? (repaired ? "llm_repair" : "llm_polished");
  const polished = pageGenerationOutputSchema.parse({
    ...output,
    markdown: mergedMarkdown,
    generationMode: repaired && baseGenerationMode !== "tutor_touch" ? "llm_repair" : baseGenerationMode,
    qualityIssues: gate.issues,
  });

  return {
    output: polished,
    qualityIssues: gate.issues,
    repaired,
    readiness: polished.readiness,
  };
}
