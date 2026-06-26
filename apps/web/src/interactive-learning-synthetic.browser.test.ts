import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReferenceSurface } from "@studyagent/schemas";
import { interactiveLearningSyntheticScenarios } from "../../../packages/schemas/src/interactive-learning-synthetic-scenarios.fixtures.js";
import { InteractiveBlockRenderer } from "./interactive-learning/interactive-block-renderer.js";
import {
  MCP_APP_SANDBOX_ATTR,
  McpAppBridge,
  buildActionEnvelope,
  interactiveLearningActionsUrl,
} from "./interactive-learning/mcp-app-bridge.js";
import {
  MCP_APP_BUNDLE_REGISTRY,
  resolveBundleForBlock,
  validateBundleRegistry,
} from "./interactive-learning/mcp-app-registry.js";
import { createTestInteractiveBlock } from "./interactive-learning/mcp-app-types.js";
import type { InteractiveLearningBlock } from "./interactive-learning/mcp-app-types.js";

const baseSurface: ReferenceSurface = {
  id: "surface_il_browser",
  notebookId: "nb_il_regression",
  nodeRef: { refType: "artifact", refId: "art_il_regression" },
  title: "Interactive learning regression",
  surfaceType: "artifact",
  summary: null,
  status: "Ready to study",
  blocks: [],
  interactiveBlocks: [],
  scopeRefs: [],
  sourceRefs: [],
  provenanceRefs: [],
  coverageRefs: [],
  primaryActions: ["ask_tutor"],
  quality: { confidence: null, sourceBacked: true, needsReview: false },
};

function blockForScenario(blockKind: InteractiveLearningBlock["kind"]): InteractiveLearningBlock {
  const allowedActionsByKind: Partial<
    Record<InteractiveLearningBlock["kind"], InteractiveLearningBlock["allowedActions"]>
  > = {
    quiz: ["quiz.answer_submitted", "tutor.help_requested"],
    flashcard_deck: ["flashcard.review_rated", "tutor.help_requested"],
    worked_example: [
      "worked_example.step_answered",
      "worked_example.step_revealed",
      "tutor.help_requested",
    ],
    evidence_explorer: ["evidence.source_span_opened", "tutor.help_requested"],
    simulation: [
      "simulation.observation_submitted",
      "simulation.parameter_snapshot_submitted",
      "tutor.help_requested",
    ],
    live_plan: ["live_plan.action_selected", "tutor.help_requested"],
    source_reader: [
      "source_reader.annotation_created",
      "evidence.source_span_opened",
      "tutor.help_requested",
    ],
    personalization_controls: ["personalization.preference_updated", "tutor.help_requested"],
    dev_trace_dashboard: ["tutor.help_requested"],
    comparison: ["surface.completed", "evidence.source_span_opened", "tutor.help_requested"],
    concept_timeline: ["evidence.source_span_opened", "tutor.help_requested"],
  };
  return createTestInteractiveBlock({
    id: `interactive_${blockKind}_browser`,
    kind: blockKind,
    title: `${blockKind} regression block`,
    learningPurpose: "Synthetic learner regression coverage",
    fallbackSummary: `Fallback summary for ${blockKind.replace(/_/g, " ")}.`,
    allowedActions: allowedActionsByKind[blockKind] ?? ["tutor.help_requested"],
  });
}

describe("interactive learning synthetic browser regression", () => {
  it("renders sandboxed MCP app iframes for every interactive learning scenario block kind", () => {
    const blockKinds = [
      ...new Set(interactiveLearningSyntheticScenarios.map((scenario) => scenario.blockKind)),
    ];

    for (const blockKind of blockKinds) {
      const block = blockForScenario(blockKind);
      const html = renderToStaticMarkup(
        React.createElement(McpAppBridge, {
          notebookId: baseSurface.notebookId,
          surfaceId: baseSurface.id,
          nodeRef: baseSurface.nodeRef,
          block,
        }),
      );

      const manifest = resolveBundleForBlock(block);
      expect(manifest).toBeTruthy();
      expect(html).toContain(`sandbox="${MCP_APP_SANDBOX_ATTR}"`);
      expect(html).not.toContain("allow-same-origin");
      expect(html).toContain(manifest!.assetPath);
    }
  });

  it("keeps bundle registry sandbox policies aligned with bridge rendering", () => {
    expect(validateBundleRegistry()).toEqual([]);
    expect(
      MCP_APP_BUNDLE_REGISTRY.every((entry) => entry.sandboxPolicy.includes(MCP_APP_SANDBOX_ATTR)),
    ).toBe(true);
    expect(
      MCP_APP_BUNDLE_REGISTRY.every((entry) => !entry.sandboxPolicy.includes("allow-same-origin")),
    ).toBe(true);
  });

  it("builds action envelopes targeting the interactive-learning dispatcher URL", () => {
    const quizBlock = blockForScenario("quiz");
    const manifest = resolveBundleForBlock(quizBlock)!;
    const envelope = buildActionEnvelope({
      notebookId: baseSurface.notebookId,
      surfaceId: baseSurface.id,
      block: quizBlock,
      nodeRef: baseSurface.nodeRef,
      actionName: "quiz.answer_submitted",
      actionPayload: { questionId: "q1", answer: "4", isCorrect: false },
      manifest,
    });

    expect(interactiveLearningActionsUrl(baseSurface.notebookId)).toBe(
      "/api/v1/notebooks/nb_il_regression/interactive-learning/actions",
    );
    expect(envelope).toMatchObject({
      notebookId: "nb_il_regression",
      surfaceId: "surface_il_browser",
      actionName: "quiz.answer_submitted",
      rendererKind: "mcp_app",
      rendererVersion: "v1",
    });
  });

  it("renders native fallback when renderer preference is native", () => {
    const block: InteractiveLearningBlock = {
      ...blockForScenario("quiz"),
      rendererPreference: "native",
      fallbackSummary: "1 practice question about derivatives.",
    };

    const html = renderToStaticMarkup(
      React.createElement(InteractiveBlockRenderer, {
        notebookId: baseSurface.notebookId,
        surface: baseSurface,
        block,
      }),
    );

    expect(html).toContain("1 practice question about derivatives.");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("quiz");
  });

  it("renders bundle-missing fallback without an iframe", () => {
    const block: InteractiveLearningBlock = {
      ...blockForScenario("simulation"),
      kind: "simulation",
      content: { simulationTemplateId: "unknown-template" },
      fallbackSummary: "Compare derivative definitions side by side.",
    };

    const html = renderToStaticMarkup(
      React.createElement(McpAppBridge, {
        notebookId: baseSurface.notebookId,
        surfaceId: baseSurface.id,
        nodeRef: baseSurface.nodeRef,
        block,
      }),
    );

    expect(html).not.toContain("<iframe");
    expect(html).toContain("Compare derivative definitions side by side.");
    expect(html).toContain("Interactive block unavailable.");
  });

  it("dispatches bridge actions through the interactive-learning API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        block: { canonicalState: { completedQuestionIds: ["q1"] } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dispatchInteractiveLearningAction } =
      await import("./interactive-learning/mcp-app-bridge.js");
    const quizBlock = blockForScenario("quiz");
    const manifest = resolveBundleForBlock(quizBlock)!;
    const result = await dispatchInteractiveLearningAction(
      buildActionEnvelope({
        notebookId: baseSurface.notebookId,
        surfaceId: baseSurface.id,
        block: quizBlock,
        nodeRef: baseSurface.nodeRef,
        actionName: "quiz.answer_submitted",
        actionPayload: { questionId: "q1", answer: "4", isCorrect: false },
        manifest,
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/notebooks/nb_il_regression/interactive-learning/actions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.canonicalState).toEqual({ completedQuestionIds: ["q1"] });
    vi.unstubAllGlobals();
  });
});
