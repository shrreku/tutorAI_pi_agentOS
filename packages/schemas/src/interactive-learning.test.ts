import { describe, expect, it } from "vitest";
import {
  interactiveLearningActionEnvelopeSchema,
  interactiveLearningBlockSchema,
  mcpAppBundleManifestSchema,
  parseInteractiveLearningActionPayload,
  simulationDraftSchema,
  simulationTemplateSchema,
} from "./interactive-learning.js";

describe("interactive learning schemas", () => {
  it("accepts all interactive learning block kinds", () => {
    const kinds = [
      "quiz",
      "flashcard_deck",
      "worked_example",
      "evidence_explorer",
      "simulation",
      "live_plan",
      "source_reader",
      "personalization_controls",
      "dev_trace_dashboard",
      "comparison",
      "concept_timeline",
    ] as const;
    for (const kind of kinds) {
      const parsed = interactiveLearningBlockSchema.parse({
        id: `block_${kind}`,
        kind,
        title: `${kind} block`,
        learningPurpose: "Learning purpose",
        content: {},
      });
      expect(parsed.kind).toBe(kind);
    }
  });

  it("accepts a quiz interactive learning block", () => {
    const parsed = interactiveLearningBlockSchema.parse({
      id: "block_quiz_1",
      kind: "quiz",
      title: "Practice quiz",
      learningPurpose: "Evaluable practice",
      content: { questions: [{ id: "q1", prompt: "2+2?" }] },
      allowedActions: ["quiz.answer_submitted"],
    });
    expect(parsed.kind).toBe("quiz");
  });

  it("rejects blocks without learning purpose", () => {
    expect(() =>
      interactiveLearningBlockSchema.parse({
        id: "block_1",
        kind: "quiz",
        title: "Quiz",
        content: {},
      }),
    ).toThrow();
  });

  it("validates action envelopes with optional session identity", () => {
    const envelope = interactiveLearningActionEnvelopeSchema.parse({
      notebookId: "nb_1",
      surfaceId: "surface_1",
      blockId: "block_1",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      actionName: "quiz.answer_submitted",
      actionPayload: { questionId: "q1", answer: "4", isCorrect: true },
      sessionId: "session_1",
    });
    expect(envelope.sessionId).toBe("session_1");
  });

  it("parses quiz answer payloads", () => {
    const parsed = parseInteractiveLearningActionPayload("quiz.answer_submitted", {
      questionId: "q1",
      answer: "test",
      isCorrect: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("validates MCP app bundle manifests", () => {
    const manifest = mcpAppBundleManifestSchema.parse({
      bundleId: "quiz",
      version: "v1",
      blockKind: "quiz",
      resourceUri: "ui://studyagent/quiz/v1",
      assetPath: "/mcp-apps/quiz/v1/index.html",
      supportedActions: ["quiz.answer_submitted"],
      sandboxPolicy: { permissions: ["allow-scripts"], allowNetwork: false, allowSubframes: false },
      fallbackSupported: true,
      blockSchemaVersion: "1",
    });
    expect(manifest.resourceUri).toContain("ui://studyagent/");
  });

  it("validates simulation template and draft records", () => {
    const template = simulationTemplateSchema.parse({
      templateId: "function-plotter",
      version: "v1",
      title: "Function plotter",
      bundleResourceUri: "ui://studyagent/simulation/function-plotter/v1",
    });
    const draft = simulationDraftSchema.parse({
      draftId: "draft_1",
      conceptNeed: "visualize quadratic behavior",
    });
    expect(template.templateId).toBe("function-plotter");
    expect(draft.evaluationStatus).toBe("draft");
  });
});
