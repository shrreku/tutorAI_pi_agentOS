import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { StudyAgentRuntimeRun } from "./index.js";

export type CachedPiSession = {
  session: {
    prompt(message: string): Promise<void>;
    subscribe(handler: (event: AgentSessionEvent) => void): () => void;
    dispose(): void;
    messages: unknown[];
    state?: {
      messages: unknown[];
    };
    steer?: (message: string) => Promise<void>;
    followUp?: (message: string) => Promise<void>;
  };
  binding: StudyAgentRuntimeBinding;
};

export type StudyAgentRuntimeBinding = {
  notebookId: string;
  sessionId: string;
  userId: string;
  activeMode: StudyAgentRuntimeRun["activeMode"];
  selectedNodeRefsFingerprint: string;
  hostStateSignature?: string;
  promptTemplateVersion: string;
  replacedAt: string;
  reason:
    | "created"
    | "notebook_changed"
    | "session_changed"
    | "user_changed"
    | "mode_changed"
    | "selected_refs_changed"
    | "host_state_changed"
    | "prompt_changed"
    | "manual";
};

let livePiSessions = new Map<string, CachedPiSession>();

export function getLivePiSessions(): Map<string, CachedPiSession> {
  return livePiSessions;
}

export function resetLivePiSessionsForTests(): void {
  for (const cached of livePiSessions.values()) {
    cached.session.dispose();
  }
  livePiSessions = new Map();
}

export function replaceLivePiSessionsForTests(next: Map<string, CachedPiSession>): void {
  livePiSessions = next;
}

function fingerprintSelectedNodeRefs(refs: Array<{ refType: string; refId: string }>): string {
  return JSON.stringify(refs.map((ref) => `${ref.refType}:${ref.refId}`).sort());
}

export function getStudyAgentTutorRuntimeBinding(
  sessionId: string,
): StudyAgentRuntimeBinding | null {
  return livePiSessions.get(sessionId)?.binding ?? null;
}

export async function disposeStudyAgentTutorSession(sessionId: string): Promise<void> {
  const cached = livePiSessions.get(sessionId);
  if (!cached) return;
  livePiSessions.delete(sessionId);
  cached.session.dispose();
}

export async function replaceStudyAgentTutorRuntime(input: {
  previousSessionId?: string;
  nextRun: StudyAgentRuntimeRun;
  reason?: StudyAgentRuntimeBinding["reason"];
}): Promise<{
  replaced: boolean;
  disposedSessionId: string | null;
  binding: StudyAgentRuntimeBinding | null;
}> {
  const nextSessionId = input.nextRun.sessionId;
  if (!nextSessionId) {
    return { replaced: false, disposedSessionId: null, binding: null };
  }

  const previousSessionId = input.previousSessionId ?? nextSessionId;
  const existing = livePiSessions.get(previousSessionId);
  const existingBinding = existing?.binding;
  const nextSelectedNodeRefsFingerprint = fingerprintSelectedNodeRefs(
    input.nextRun.selectedNodeRefs,
  );
  const materialChange =
    input.reason === "manual" ||
    previousSessionId !== nextSessionId ||
    existingBinding?.notebookId !== input.nextRun.notebookId ||
    existingBinding?.userId !== input.nextRun.userId ||
    (existingBinding?.activeMode !== undefined &&
      existingBinding.activeMode !== input.nextRun.activeMode) ||
    (existingBinding?.selectedNodeRefsFingerprint !== undefined &&
      existingBinding.selectedNodeRefsFingerprint !== nextSelectedNodeRefsFingerprint) ||
    (existingBinding?.hostStateSignature !== undefined &&
      existingBinding.hostStateSignature !== input.nextRun.hostStateSignature) ||
    existingBinding?.promptTemplateVersion !== input.nextRun.modelConfig.promptTemplateVersion;

  if (!existing || !materialChange) {
    return { replaced: false, disposedSessionId: null, binding: existingBinding ?? null };
  }

  livePiSessions.delete(previousSessionId);
  existing.session.dispose();
  return {
    replaced: true,
    disposedSessionId: previousSessionId,
    binding: {
      notebookId: input.nextRun.notebookId,
      sessionId: nextSessionId,
      userId: input.nextRun.userId,
      activeMode: input.nextRun.activeMode,
      selectedNodeRefsFingerprint: nextSelectedNodeRefsFingerprint,
      ...(input.nextRun.hostStateSignature
        ? { hostStateSignature: input.nextRun.hostStateSignature }
        : {}),
      promptTemplateVersion: input.nextRun.modelConfig.promptTemplateVersion,
      replacedAt: new Date().toISOString(),
      reason:
        input.reason ??
        (previousSessionId !== nextSessionId
          ? "session_changed"
          : existingBinding?.notebookId !== input.nextRun.notebookId
            ? "notebook_changed"
            : existingBinding?.userId !== input.nextRun.userId
              ? "user_changed"
              : existingBinding?.activeMode !== undefined &&
                  existingBinding.activeMode !== input.nextRun.activeMode
                ? "mode_changed"
                : existingBinding?.selectedNodeRefsFingerprint !== undefined &&
                    existingBinding.selectedNodeRefsFingerprint !== nextSelectedNodeRefsFingerprint
                  ? "selected_refs_changed"
                  : existingBinding?.hostStateSignature !== undefined &&
                      existingBinding.hostStateSignature !== input.nextRun.hostStateSignature
                    ? "host_state_changed"
                    : "prompt_changed"),
    },
  };
}
