import {
  eventTypeSchema,
  resolveWorkspaceRefreshPolicy,
  type WorkspaceRefreshHint,
  type WorkspaceRefreshPolicy,
} from "@studyagent/schemas";
import type { QueryClient } from "@tanstack/react-query";
import { notebookStudyStateQueryKey } from "./notebook-queries.js";

export const WORKSPACE_REFRESH_EVENT_TYPES = eventTypeSchema.options;

export {
  resolveWorkspaceRefreshPolicy,
  resolveWorkspaceRefreshPolicy as workspaceRefreshPolicyForEvent,
} from "@studyagent/schemas";
export type { WorkspaceRefreshHint, WorkspaceRefreshPolicy };

export function shouldInvalidateArtifactsForEvent(eventType: (typeof WORKSPACE_REFRESH_EVENT_TYPES)[number]): boolean {
  return resolveWorkspaceRefreshPolicy(eventType).targets.includes("artifacts");
}

export function applyWorkspaceRefreshInvalidations(input: {
  notebookId: string;
  policy: WorkspaceRefreshPolicy;
  queryClient: QueryClient;
  onGraphProjectionUpdated: () => void;
}): void {
  const { notebookId, policy, queryClient, onGraphProjectionUpdated } = input;

  if (policy.targets.includes("sources")) {
    void queryClient.invalidateQueries({ queryKey: ["notebook-sources", notebookId] });
  }
  if (policy.targets.includes("graph")) {
    onGraphProjectionUpdated();
  }
  if (policy.targets.includes("studyState")) {
    void queryClient.invalidateQueries({ queryKey: notebookStudyStateQueryKey(notebookId) });
  }
  if (policy.targets.includes("artifacts")) {
    void queryClient.invalidateQueries({ queryKey: ["notebook-artifacts", notebookId] });
  }
  if (policy.targets.includes("curriculum")) {
    void queryClient.invalidateQueries({ queryKey: ["curriculum-outline", notebookId] });
  }
  if (policy.targets.includes("referenceSurfaces")) {
    void queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId] });
    for (const nodeId of policy.nodeIds) {
      void queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId, nodeId] });
    }
    for (const artifactId of policy.artifactIds) {
      void queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId, artifactId] });
    }
  }
  if (policy.targets.includes("quizAttempts")) {
    if (policy.artifactIds.length > 0) {
      for (const artifactId of policy.artifactIds) {
        void queryClient.invalidateQueries({ queryKey: ["quiz-attempts", notebookId, artifactId] });
      }
    } else {
      void queryClient.invalidateQueries({ queryKey: ["quiz-attempts", notebookId] });
    }
  }
  if (policy.targets.includes("sourceFiles")) {
    void queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId] });
    for (const sourceId of policy.sourceIds) {
      void queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId, sourceId] });
    }
  }
}
