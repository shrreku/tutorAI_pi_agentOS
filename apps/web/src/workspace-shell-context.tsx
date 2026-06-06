import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  initialWorkspaceShellState,
  workspaceShellReducer,
  type WorkspaceShellAction,
  type WorkspaceShellState,
} from "./workspace-shell-reducer.js";

type WorkspaceShellContextValue = {
  shell: WorkspaceShellState;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  setSelectedNodeRefs: (refs: Array<{ refType: string; refId: string }>) => void;
  draftTutorPrompt: string | null;
  setDraftTutorPrompt: (prompt: string | null) => void;
  dispatchShell: Dispatch<WorkspaceShellAction>;
};

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

export function WorkspaceShellProvider({
  notebookId,
  children,
  selectedNodeRefs,
  onSelectedNodeRefsChange,
}: {
  notebookId: string;
  children: ReactNode;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  onSelectedNodeRefsChange: (refs: Array<{ refType: string; refId: string }>) => void;
}) {
  const [shell, dispatchShell] = useReducer(workspaceShellReducer, initialWorkspaceShellState);
  const [draftTutorPrompt, setDraftTutorPromptState] = useReducer(
    (_: string | null, action: string | null) => action,
    null,
  );

  const setDraftTutorPrompt = useCallback((prompt: string | null) => {
    setDraftTutorPromptState(prompt);
    if (prompt) {
      window.dispatchEvent(new CustomEvent("studyagent:tutor-draft-prompt", { detail: { prompt } }));
    }
  }, []);

  const setSelectedNodeRefs = useCallback(
    (refs: Array<{ refType: string; refId: string }>) => {
      onSelectedNodeRefsChange(refs);
    },
    [onSelectedNodeRefsChange],
  );

  const value = useMemo(
    () => ({
      shell,
      selectedNodeRefs,
      setSelectedNodeRefs,
      draftTutorPrompt,
      setDraftTutorPrompt,
      dispatchShell,
    }),
    [shell, selectedNodeRefs, setSelectedNodeRefs, draftTutorPrompt, setDraftTutorPrompt],
  );

  return <WorkspaceShellContext.Provider value={value}>{children}</WorkspaceShellContext.Provider>;
}

export function useWorkspaceShell(): WorkspaceShellContextValue {
  const ctx = useContext(WorkspaceShellContext);
  if (!ctx) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShellProvider");
  }
  return ctx;
}
