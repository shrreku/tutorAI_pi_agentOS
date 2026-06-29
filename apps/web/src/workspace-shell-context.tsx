import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  initialWorkspaceShellState,
  workspaceShellReducer,
  type WorkspaceShellAction,
  type WorkspaceShellState,
} from "./workspace-shell-reducer.js";

export type DraftTutorPrompt = {
  prompt: string;
  mode?: "learn" | "practice" | "revise" | "explore" | "wiki_maintenance";
};

export type TutorRuntimeContext = {
  sessionId?: string;
  turnId?: string;
  runId?: string;
};

export type InteractiveSurfaceLaunchDetail = {
  nodeId: string;
  blockKind?: string | null;
  blockId?: string | null;
};

type WorkspaceShellContextValue = {
  shell: WorkspaceShellState;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  setSelectedNodeRefs: (refs: Array<{ refType: string; refId: string }>) => void;
  draftTutorPrompt: DraftTutorPrompt | null;
  setDraftTutorPrompt: (prompt: DraftTutorPrompt | string | null) => void;
  tutorRuntime: TutorRuntimeContext;
  setTutorRuntime: (runtime: TutorRuntimeContext) => void;
  dispatchShell: Dispatch<WorkspaceShellAction>;
  launchInteractiveSurface: (detail: InteractiveSurfaceLaunchDetail) => void;
  registerInteractiveSurfaceLaunchHandler: (
    handler: (detail: InteractiveSurfaceLaunchDetail) => void,
  ) => () => void;
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
    (_: DraftTutorPrompt | null, action: DraftTutorPrompt | null) => action,
    null,
  );
  const [tutorRuntime, setTutorRuntime] = useState<TutorRuntimeContext>({});
  const interactiveSurfaceLaunchHandlerRef = useRef<
    ((detail: InteractiveSurfaceLaunchDetail) => void) | null
  >(null);

  const setDraftTutorPrompt = useCallback((prompt: DraftTutorPrompt | string | null) => {
    setDraftTutorPromptState(typeof prompt === "string" ? { prompt } : prompt);
  }, []);

  const setSelectedNodeRefs = useCallback(
    (refs: Array<{ refType: string; refId: string }>) => {
      onSelectedNodeRefsChange(refs);
    },
    [onSelectedNodeRefsChange],
  );

  const launchInteractiveSurface = useCallback((detail: InteractiveSurfaceLaunchDetail) => {
    interactiveSurfaceLaunchHandlerRef.current?.(detail);
  }, []);

  const registerInteractiveSurfaceLaunchHandler = useCallback(
    (handler: (detail: InteractiveSurfaceLaunchDetail) => void) => {
      interactiveSurfaceLaunchHandlerRef.current = handler;
      return () => {
        if (interactiveSurfaceLaunchHandlerRef.current === handler) {
          interactiveSurfaceLaunchHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const value = useMemo(
    () => ({
      shell,
      selectedNodeRefs,
      setSelectedNodeRefs,
      draftTutorPrompt,
      setDraftTutorPrompt,
      tutorRuntime,
      setTutorRuntime,
      dispatchShell,
      launchInteractiveSurface,
      registerInteractiveSurfaceLaunchHandler,
    }),
    [
      shell,
      selectedNodeRefs,
      setSelectedNodeRefs,
      draftTutorPrompt,
      setDraftTutorPrompt,
      tutorRuntime,
      launchInteractiveSurface,
      registerInteractiveSurfaceLaunchHandler,
    ],
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
