import type { StudyAgentPromptContext } from "./index.js";
import { createRuntimeId } from "./index.js";

export type MockTutorPlanStep =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolName: string; toolCallId: string; args: unknown };

const GENERIC_IDLE_REPLY = /^i['']?m ready to help you learn in /i;

export function isGenericTutorIdleReply(message: string): boolean {
  return GENERIC_IDLE_REPLY.test(message.trim());
}

function toolCallId(): string {
  return createRuntimeId("toolcall");
}

function conceptIds(context: StudyAgentPromptContext): string[] {
  return context.selectedNodeRefs
    .filter((ref) => ref.refType === "concept")
    .map((ref) => ref.refId);
}

function sourceNodeRefs(
  context: StudyAgentPromptContext,
): StudyAgentPromptContext["selectedNodeRefs"] {
  return context.selectedNodeRefs;
}

function matchesAny(lower: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(lower));
}

export function planMockTutorSessionSteps(
  userMessage: string,
  context: StudyAgentPromptContext,
): MockTutorPlanStep[] {
  const lower = userMessage.toLowerCase().trim();
  const concepts = conceptIds(context);
  const sources = sourceNodeRefs(context);

  if (lower.includes("quiz")) {
    return [
      { type: "text", content: "I'll create a grounded quiz draft from your notebook context. " },
      {
        type: "tool_call",
        toolName: "artifact.create_quiz",
        toolCallId: toolCallId(),
        args: {
          title: `${context.notebookTitle} quiz`,
          prompt: userMessage,
          conceptIds: concepts,
          sourceNodeRefs: sources,
          questionCount: 5,
        },
      },
    ];
  }

  if (lower.includes("flashcard") || lower.includes("flashcards")) {
    return [
      {
        type: "text",
        content: "I'll create grounded flashcards from the notebook concepts in scope. ",
      },
      {
        type: "tool_call",
        toolName: "artifact.create_flashcards",
        toolCallId: toolCallId(),
        args: {
          title: `${context.notebookTitle} flashcards`,
          prompt: userMessage,
          conceptIds: concepts,
          sourceNodeRefs: sources,
          cardCount: 8,
        },
      },
    ];
  }

  if (
    matchesAny(lower, [
      /\b(is that|was that|am i|are we)\b.*\b(right|correct)\b/,
      /\bcorrection\b/,
      /\bevaluate\b.*\b(answer|response)\b/,
      /\bcheck whether\b.*\b(right|correct|understanding)\b/,
    ]) ||
    (lower.includes("tangent") && lower.includes("?"))
  ) {
    return [
      { type: "text", content: "I'll evaluate that answer against the mastery checkpoint. " },
      {
        type: "tool_call",
        toolName: "learning.evaluate_response",
        toolCallId: toolCallId(),
        args: {
          tutorQuestion:
            "Explain whether the derivative uses a secant line or tangent line at the limit.",
          learnerAnswer: userMessage,
          conceptRoles: concepts.length
            ? concepts.map((conceptId) => ({ conceptId, role: "core" }))
            : [{ conceptId: "concept_derivatives", role: "core" }],
          masterySnapshot: Object.fromEntries(
            (concepts.length ? concepts : ["concept_derivatives"]).map((conceptId) => [
              conceptId,
              0.45,
            ]),
          ),
          sourceRefs: sources.filter((ref) => ref.refType === "source"),
          contextRefs: [],
          evidenceType: "mastery-check",
          triggerSource: "tool",
        },
      },
    ];
  }

  if (
    matchesAny(lower, [
      /\bslope\b/,
      /\btangent\b/,
      /\bsecant\b/,
      /\bmixing\b/,
      /\binstantaneous\b/,
      /\bderivative\b/,
      /\brate of change\b/,
    ])
  ) {
    return [
      {
        type: "text",
        content:
          "You are close: a derivative is the tangent-line slope, found as the limit of secant slopes. The formula starts with two points, but the limit is what turns the average rate into an instantaneous rate. Can you explain in your own words how the secant line becomes the tangent line?",
      },
    ];
  }

  if (lower.includes("concept card") || lower.includes("concept reference")) {
    return [
      { type: "text", content: "I'll create a compact concept card with source grounding. " },
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
          conceptIds: concepts,
          sourceNodeRefs: sources,
        },
      },
    ];
  }

  if (
    matchesAny(lower, [
      /\bfourier\b/,
      /\bheat flux\b/,
      /\bthermal conductivity\b/,
      /\bnegative sign\b/,
      /\btemperature gradient\b/,
      /\bconduction\b/,
    ])
  ) {
    return [
      {
        type: "text",
        content:
          "Fourier’s law says conduction heat transfer follows the temperature gradient, but heat flows from higher temperature toward lower temperature. In one dimension, q = -kA dT/dx uses k for how readily the material conducts heat and A for area. The negative sign keeps the heat-rate direction physically correct: if temperature increases as x increases, dT/dx is positive, so heat flows in the negative x direction. Quick check: if the left side of a wall is hotter and x points to the right, what sign would you expect dT/dx to have, and which way should heat flow?",
      },
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
          selectedNodeRefs: sources,
          conceptIds: concepts,
          maxResults: 5,
        },
      },
    ];
  }

  if (
    matchesAny(lower, [
      /\bteach me\b/,
      /\bmissing a key idea\b/,
      /\bhelp me understand\b/,
      /\bwhere i (went|go) wrong\b/,
      /\bunsure about\b/,
      /\bconfused\b/,
      /\bstuck on\b/,
    ])
  ) {
    return [
      {
        type: "text",
        content:
          "The derivative measures instantaneous rate of change as the limit of average rates of change. The important distinction is that the secant-line slope uses two points, while the derivative is the tangent-line slope reached by taking the limit as the points get arbitrarily close. Can you explain in your own words whether the derivative is just slope, or whether the limit changes what kind of slope it is?",
      },
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
          selectedNodeRefs: sources,
          conceptIds: concepts,
          maxResults: 5,
        },
      },
    ];
  }

  if (lower.includes("note") || lower.includes("summary")) {
    return [
      { type: "text", content: "I'll create a note draft so this can persist in the notebook. " },
      {
        type: "tool_call",
        toolName: "artifact.create_note",
        toolCallId: toolCallId(),
        args: {
          title: `${context.notebookTitle} note`,
          noteMarkdown: `## Tutor note\n\n${userMessage}`,
          sourceNodeRefs: sources,
          blockOwnerType: "agent",
        },
      },
    ];
  }

  if (lower.includes("claim")) {
    return [
      { type: "text", content: "I'll turn that into a candidate claim with explicit provenance. " },
      {
        type: "tool_call",
        toolName: "wiki.propose_claim",
        toolCallId: toolCallId(),
        args: {
          claimText: userMessage,
          claimType: "tutor_proposal",
          conceptIds: concepts,
          sourceRefs: sources.filter((ref) =>
            ["source", "source_version", "chunk"].includes(ref.refType),
          ),
        },
      },
    ];
  }

  if (lower.includes("evaluate answer")) {
    return [
      { type: "text", content: "I'll evaluate that answer against the mastery check. " },
      {
        type: "tool_call",
        toolName: "learning.evaluate_response",
        toolCallId: toolCallId(),
        args: {
          tutorQuestion: "Quick check: explain the concept.",
          learnerAnswer: userMessage,
          conceptRoles: [{ conceptId: "concept_vectors", role: "core" }],
          masterySnapshot: { concept_vectors: 0.45 },
          sourceRefs: [],
          contextRefs: [],
          evidenceType: "mastery-check",
          triggerSource: "tool",
        },
      },
    ];
  }

  if (lower.includes("record trait")) {
    return [
      { type: "text", content: "I'll record that learner trait signal. " },
      {
        type: "tool_call",
        toolName: "learner_trait.record_signal",
        toolCallId: toolCallId(),
        args: {
          trait: "pacePreference",
          value: "slow",
          source: "explicit_self_report",
          evidenceRefs: [{ refType: "self_report", refId: "turn_1" }],
        },
      },
    ];
  }

  if (
    matchesAny(lower, [
      /\brevision\b/,
      /\btied to the source\b/,
      /\bgrounded in\b/,
      /\buseful for revision\b/,
      /\bkeep it tied\b/,
    ])
  ) {
    return [
      {
        type: "text",
        content: "I'll build a source-grounded revision artifact from your notebook context. ",
      },
      {
        type: "tool_call",
        toolName: "notebook.get_context",
        toolCallId: toolCallId(),
        args: { includeRecentActivity: true },
      },
      {
        type: "tool_call",
        toolName: "artifact.create_quiz",
        toolCallId: toolCallId(),
        args: {
          title: `${context.notebookTitle} revision quiz`,
          prompt: userMessage,
          conceptIds: concepts,
          sourceNodeRefs: sources,
          questionCount: 5,
        },
      },
    ];
  }

  if (lower.includes("study plan") || lower.includes("objective")) {
    return [
      { type: "text", content: "I'm checking the active study plan and curriculum first. " },
      { type: "tool_call", toolName: "study_plan.get_current", toolCallId: toolCallId(), args: {} },
      { type: "tool_call", toolName: "curriculum.get", toolCallId: toolCallId(), args: {} },
    ];
  }

  if (lower.includes("graph") || lower.includes("map")) {
    return [
      { type: "text", content: "I'm loading the relevant graph map for this notebook. " },
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
    ];
  }

  if (
    lower.includes("search") ||
    lower.includes("find") ||
    lower.includes("explain") ||
    lower.includes("?")
  ) {
    return [
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
          selectedNodeRefs: sources,
          conceptIds: concepts,
          maxResults: 5,
        },
      },
    ];
  }

  return [
    {
      type: "text",
      content: `Let me ground this in your notebook materials for "${context.currentObjective ?? context.notebookTitle}" before we continue. `,
    },
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
        selectedNodeRefs: sources,
        conceptIds: concepts,
        maxResults: 5,
      },
    },
  ];
}
