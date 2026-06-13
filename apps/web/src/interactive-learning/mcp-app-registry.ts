import type { InteractiveLearningBlockKind } from "@studyagent/schemas";
import type { InteractiveLearningBlock } from "./mcp-app-types.js";

export const MCP_APP_BRIDGE_CHANNEL = "studyagent-mcp-app";

export const MCP_APP_SANDBOX_ATTR = "allow-scripts";

const FORBIDDEN_SANDBOX_PERMISSIONS = ["allow-same-origin", "allow-top-navigation", "allow-popups"] as const;

export type McpAppBundleManifest = {
  bundleId: string;
  version: string;
  blockKind: InteractiveLearningBlockKind | "simulation_template";
  simulationTemplateId?: string;
  resourceUri: string;
  assetPath: string;
  supportedActions: string[];
  sandboxPolicy: string[];
  fallbackSupported: boolean;
  blockSchemaVersion: string;
};

export const MCP_APP_BUNDLE_REGISTRY: McpAppBundleManifest[] = [
  {
    bundleId: "quiz",
    version: "v1",
    blockKind: "quiz",
    resourceUri: "ui://studyagent/quiz/v1",
    assetPath: "/mcp-apps/quiz/v1/index.html",
    supportedActions: ["quiz.answer_submitted", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "flashcards",
    version: "v1",
    blockKind: "flashcard_deck",
    resourceUri: "ui://studyagent/flashcards/v1",
    assetPath: "/mcp-apps/flashcards/v1/index.html",
    supportedActions: ["flashcard.review_rated", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "worked-example",
    version: "v1",
    blockKind: "worked_example",
    resourceUri: "ui://studyagent/worked-example/v1",
    assetPath: "/mcp-apps/worked-example/v1/index.html",
    supportedActions: [
      "worked_example.step_answered",
      "worked_example.step_revealed",
      "tutor.help_requested",
    ],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "evidence-explorer",
    version: "v1",
    blockKind: "evidence_explorer",
    resourceUri: "ui://studyagent/evidence-explorer/v1",
    assetPath: "/mcp-apps/evidence-explorer/v1/index.html",
    supportedActions: ["evidence.source_span_opened", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "live-plan",
    version: "v1",
    blockKind: "live_plan",
    resourceUri: "ui://studyagent/live-plan/v1",
    assetPath: "/mcp-apps/live-plan/v1/index.html",
    supportedActions: ["live_plan.action_selected", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "function-plotter",
    version: "v1",
    blockKind: "simulation_template",
    simulationTemplateId: "function-plotter",
    resourceUri: "ui://studyagent/simulation/function-plotter/v1",
    assetPath: "/mcp-apps/function-plotter/v1/index.html",
    supportedActions: [
      "simulation.observation_submitted",
      "simulation.parameter_snapshot_submitted",
      "tutor.help_requested",
    ],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "source-reader",
    version: "v1",
    blockKind: "source_reader",
    resourceUri: "ui://studyagent/source-reader/v1",
    assetPath: "/mcp-apps/source-reader/v1/index.html",
    supportedActions: ["source_reader.annotation_created", "evidence.source_span_opened", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "personalization-controls",
    version: "v1",
    blockKind: "personalization_controls",
    resourceUri: "ui://studyagent/personalization-controls/v1",
    assetPath: "/mcp-apps/personalization-controls/v1/index.html",
    supportedActions: ["personalization.preference_updated", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "comparison",
    version: "v1",
    blockKind: "comparison",
    resourceUri: "ui://studyagent/comparison/v1",
    assetPath: "/mcp-apps/comparison/v1/index.html",
    supportedActions: ["evidence.source_span_opened", "surface.completed", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "concept-timeline",
    version: "v1",
    blockKind: "concept_timeline",
    resourceUri: "ui://studyagent/concept-timeline/v1",
    assetPath: "/mcp-apps/concept-timeline/v1/index.html",
    supportedActions: ["evidence.source_span_opened", "tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
  {
    bundleId: "dev-trace",
    version: "v1",
    blockKind: "dev_trace_dashboard",
    resourceUri: "ui://studyagent/dev-trace/v1",
    assetPath: "/mcp-apps/dev-trace/v1/index.html",
    supportedActions: ["tutor.help_requested"],
    sandboxPolicy: [MCP_APP_SANDBOX_ATTR],
    fallbackSupported: true,
    blockSchemaVersion: "1",
  },
];

function simulationTemplateId(block: InteractiveLearningBlock): string {
  if (block.simulationTemplateId) return block.simulationTemplateId;
  if (block.content && typeof block.content === "object" && block.content !== null) {
    const record = block.content as Record<string, unknown>;
    if (typeof record.simulationTemplateId === "string") return record.simulationTemplateId;
    if (typeof record.templateId === "string") return record.templateId.split("/").pop() ?? "function-plotter";
  }
  return "function-plotter";
}

export function resolveBundleForBlock(block: InteractiveLearningBlock): McpAppBundleManifest | null {
  if (block.kind === "simulation") {
    const templateId = simulationTemplateId(block);
    return (
      MCP_APP_BUNDLE_REGISTRY.find(
        (entry) => entry.blockKind === "simulation_template" && entry.simulationTemplateId === templateId,
      ) ?? null
    );
  }
  return MCP_APP_BUNDLE_REGISTRY.find((entry) => entry.blockKind === block.kind) ?? null;
}

export function bundleAssetUrl(manifest: McpAppBundleManifest): string {
  return manifest.assetPath;
}

export function validateBundleManifest(manifest: McpAppBundleManifest): string[] {
  const errors: string[] = [];
  if (!manifest.resourceUri.startsWith("ui://studyagent/")) {
    errors.push(`resourceUri must use ui://studyagent/ prefix: ${manifest.resourceUri}`);
  }
  for (const permission of manifest.sandboxPolicy) {
    if ((FORBIDDEN_SANDBOX_PERMISSIONS as readonly string[]).includes(permission)) {
      errors.push(`forbidden sandbox permission: ${permission}`);
    }
  }
  if (manifest.supportedActions.length === 0) {
    errors.push("supportedActions must not be empty");
  }
  return errors;
}

export function validateBundleRegistry(): string[] {
  return MCP_APP_BUNDLE_REGISTRY.flatMap((manifest) =>
    validateBundleManifest(manifest).map((error) => `${manifest.bundleId}: ${error}`),
  );
}
