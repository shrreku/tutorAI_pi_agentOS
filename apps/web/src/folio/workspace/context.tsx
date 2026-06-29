import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type SelectedNodeRef = { refType: string; refId: string };

export type DraftTutorPrompt = {
  prompt: string;
  mode?: "learn" | "practice" | "revise" | "explore" | "wiki_maintenance";
};

type WorkspaceContextValue = {
  notebookId: string;
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
  draftTutorPrompt: DraftTutorPrompt | null;
  setDraftTutorPrompt: (value: DraftTutorPrompt | null) => void;
  splitPercent: number;
  setSplitPercent: (value: number) => void;
  graphRefreshToken: number;
  bumpGraphRefresh: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const CHAT_MIN = 44;
const CHAT_MAX = 72;
const CHAT_DEFAULT = 56;

export function WorkspaceProvider({
  notebookId,
  children,
}: {
  notebookId: string;
  children: ReactNode;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draftTutorPrompt, setDraftTutorPrompt] = useState<DraftTutorPrompt | null>(null);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const [splitPercent, setSplitPercentState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(`folio.split.${notebookId}`);
      const next = raw ? Number(raw) : CHAT_DEFAULT;
      return Number.isFinite(next)
        ? Math.min(CHAT_MAX, Math.max(CHAT_MIN, next))
        : CHAT_DEFAULT;
    } catch {
      return CHAT_DEFAULT;
    }
  });

  const setSplitPercent = (value: number) => {
    const clamped = Math.min(CHAT_MAX, Math.max(CHAT_MIN, value));
    setSplitPercentState(clamped);
    try {
      window.localStorage.setItem(`folio.split.${notebookId}`, String(clamped));
    } catch {
      /* ignore */
    }
  };

  const value = useMemo(
    () => ({
      notebookId,
      selectedNodeId,
      setSelectedNodeId,
      draftTutorPrompt,
      setDraftTutorPrompt,
      splitPercent,
      setSplitPercent,
      graphRefreshToken,
      bumpGraphRefresh: () => setGraphRefreshToken((t) => t + 1),
    }),
    [notebookId, selectedNodeId, draftTutorPrompt, splitPercent, graphRefreshToken],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useFolioWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useFolioWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export { CHAT_MIN, CHAT_MAX, CHAT_DEFAULT };
