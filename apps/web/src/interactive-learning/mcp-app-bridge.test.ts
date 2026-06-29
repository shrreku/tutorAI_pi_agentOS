import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MCP_APP_SANDBOX_ATTR,
  McpAppBridge,
  buildActionEnvelope,
  buildBlockStateMessage,
  buildInitializeMessage,
  buildToolResultMessage,
  interactiveLearningActionsUrl,
  parseBridgeMessage,
} from "./mcp-app-bridge.js";
import {
  MCP_APP_BUNDLE_REGISTRY,
  resolveBundleForBlock,
  validateBundleRegistry,
} from "./mcp-app-registry.js";
import { createTestInteractiveBlock } from "./mcp-app-types.js";

const quizBlock = createTestInteractiveBlock({
  id: "block_quiz_1",
  kind: "quiz",
  title: "Practice quiz",
  content: { questions: [{ id: "q1", prompt: "2 + 2?", choices: ["3", "4"] }] },
  canonicalState: { activeIndex: 0 },
  allowedActions: ["quiz.answer_submitted", "tutor.help_requested"],
});

describe("mcp app bridge protocol", () => {
  it("builds initialize and block-state messages with the shared channel", () => {
    const init = buildInitializeMessage({
      theme: "light",
      width: 640,
      height: 420,
      devMode: false,
    });
    const blockState = buildBlockStateMessage({
      block: quizBlock,
      canonicalState: { activeIndex: 1 },
    });

    expect(init).toMatchObject({
      channel: "studyagent-mcp-app",
      direction: "host-to-app",
      type: "ui/initialize",
      payload: { theme: "light", width: 640, height: 420, devMode: false },
    });
    expect(blockState.type).toBe("block-state");
    expect(blockState.payload).toMatchObject({
      block: quizBlock,
      canonicalState: { activeIndex: 1 },
    });
  });

  it("parses app action messages and ignores foreign channels", () => {
    expect(
      parseBridgeMessage({
        channel: "studyagent-mcp-app",
        direction: "app-to-host",
        type: "action",
        actionName: "quiz.answer_submitted",
        payload: { answer: "4" },
      }),
    ).toMatchObject({
      type: "action",
      actionName: "quiz.answer_submitted",
    });
    expect(
      parseBridgeMessage({ channel: "other", direction: "app-to-host", type: "action" }),
    ).toBeNull();
  });

  it("builds tool-result updates for state reconciliation", () => {
    expect(buildToolResultMessage({ canonicalState: { score: 2 }, error: "retry" })).toEqual({
      channel: "studyagent-mcp-app",
      direction: "host-to-app",
      type: "tool-result",
      payload: { canonicalState: { score: 2 }, error: "retry" },
    });
  });

  it("builds action envelopes targeting the interactive-learning dispatcher", () => {
    const manifest = resolveBundleForBlock(quizBlock)!;
    const envelope = buildActionEnvelope({
      notebookId: "nb_1",
      surfaceId: "surface_1",
      block: quizBlock,
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      actionName: "quiz.answer_submitted",
      actionPayload: { answer: "4" },
      manifest,
    });

    expect(envelope).toMatchObject({
      notebookId: "nb_1",
      surfaceId: "surface_1",
      blockId: "block_quiz_1",
      actionName: "quiz.answer_submitted",
      rendererKind: "mcp_app",
      rendererVersion: "v1",
    });
    expect(interactiveLearningActionsUrl("nb_1")).toBe(
      "/api/v1/notebooks/nb_1/interactive-learning/actions",
    );
  });

  it("rejects actions not supported by both the bundle and block", () => {
    const manifest = resolveBundleForBlock(quizBlock)!;
    expect(() =>
      buildActionEnvelope({
        notebookId: "nb_1",
        surfaceId: "surface_1",
        block: quizBlock,
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        actionName: "flashcard.review_rated",
        actionPayload: {},
        manifest,
      }),
    ).toThrow(/not supported/);

    expect(() =>
      buildActionEnvelope({
        notebookId: "nb_1",
        surfaceId: "surface_1",
        block: { ...quizBlock, allowedActions: ["tutor.help_requested"] },
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        actionName: "quiz.answer_submitted",
        actionPayload: {},
        manifest,
      }),
    ).toThrow(/not allowed/);
  });
});

describe("mcp app registry", () => {
  it("maps block kinds and simulation templates to ui:// resources and asset paths", () => {
    const quizManifest = resolveBundleForBlock(quizBlock);
    expect(quizManifest?.resourceUri).toBe("ui://studyagent/quiz/v1");
    expect(quizManifest?.assetPath).toBe("/mcp-apps/quiz/v1/index.html");

    const simulationManifest = resolveBundleForBlock(
      createTestInteractiveBlock({
        id: "sim_1",
        kind: "simulation",
        title: "Simulation",
        simulationTemplateId: "function-plotter",
      }),
    );
    expect(simulationManifest?.resourceUri).toBe("ui://studyagent/simulation/function-plotter/v1");
    expect(simulationManifest?.assetPath).toBe("/mcp-apps/function-plotter/v1/index.html");

    for (const kind of ["comparison", "concept_timeline"] as const) {
      const manifest = resolveBundleForBlock(
        createTestInteractiveBlock({
          id: `${kind}_1`,
          kind,
          title: kind,
        }),
      );
      expect(manifest?.blockKind).toBe(kind);
      expect(manifest?.resourceUri).toContain(`ui://studyagent/`);
    }
  });

  it("rejects forbidden sandbox permissions in bundle manifests", () => {
    const violations = validateBundleRegistry();
    expect(violations).toEqual([]);
    expect(
      MCP_APP_BUNDLE_REGISTRY.every((entry) => entry.sandboxPolicy.includes(MCP_APP_SANDBOX_ATTR)),
    ).toBe(true);
    expect(
      MCP_APP_BUNDLE_REGISTRY.every((entry) => !entry.sandboxPolicy.includes("allow-same-origin")),
    ).toBe(true);
  });
});

describe("McpAppBridge rendering", () => {
  it("renders a sandboxed iframe without allow-same-origin", () => {
    const html = renderToStaticMarkup(
      React.createElement(McpAppBridge, {
        notebookId: "nb_1",
        surfaceId: "surface_1",
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        block: quizBlock,
      }),
    );

    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain("/mcp-apps/quiz/v1/index.html");
  });

  it("dispatches actions through the interactive-learning API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        block: { canonicalState: { activeIndex: 1, score: 1 } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dispatchInteractiveLearningAction } = await import("./mcp-app-bridge.js");
    const manifest = resolveBundleForBlock(quizBlock)!;
    const result = await dispatchInteractiveLearningAction(
      buildActionEnvelope({
        notebookId: "nb_1",
        surfaceId: "surface_1",
        block: quizBlock,
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        actionName: "quiz.answer_submitted",
        actionPayload: { answer: "4" },
        manifest,
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/notebooks/nb_1/interactive-learning/actions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.canonicalState).toEqual({ activeIndex: 1, score: 1 });
    vi.unstubAllGlobals();
  });
});
