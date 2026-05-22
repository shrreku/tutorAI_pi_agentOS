import React, { useMemo, useRef, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import katex from "katex";
import type { UIMessage } from "@tanstack/ai-client";
import type { ChatTraceResponse, ChatTraceTurn } from "@studyagent/schemas";
import { AgentTrace, type LiveTraceRun, updateLiveTraceRun } from "./AgentTrace.js";

type SelectedNodeRef = { refType: string; refId: string };

type StudyState = {
  studentProfile: {
    id: string;
    goalSummary: string | null;
    backgroundSummary: string | null;
    pacePreference: string | null;
    depthPreference: string | null;
  } | null;
  curriculum: {
    id: string;
    title: string;
    status: string;
    activeModuleId: string | null;
  } | null;
  module: {
    id: string;
    title: string;
    summary: string | null;
    status: string;
  } | null;
  objectiveList: {
    id: string;
    title: string;
    status: string;
    currentObjectiveId: string | null;
    objectiveIdsOrdered: string[];
  } | null;
  sessionPlan: {
    id: string;
    title: string;
    status: string;
    sessionGoal: string | null;
    plannedObjectiveIds: string[];
  } | null;
  studyPlan: {
    id: string;
    title: string;
    status: string;
    activeSessionId: string | null;
    currentObjective: { id: string; title: string; status: string } | null;
    upcomingObjectives: Array<{ id: string; title: string; status: string }>;
    completedObjectives: Array<{ id: string; title: string; status: string }>;
    weakConcepts: Array<{ id: string; name: string }>;
  } | null;
  tutorSession: {
    active: { id: string; status: string; mode: string; startedAt: string; endedAt: string | null } | null;
    last: { id: string; status: string; mode: string; startedAt: string; endedAt: string | null } | null;
    canContinue: boolean;
    suggestedAction: "upload_sources" | "build_curriculum" | "continue_session" | "start_session" | "review_completed";
  };
  coverage: {
    total: number;
    planned: number;
    introduced: number;
    checked: number;
    mastered: number;
    needsReview: number;
    gaps: Array<{ coverageItemId: string; title: string; itemFamily: string; status: string }>;
  };
};

type ArtifactSummary = {
  id: string;
  title: string;
  artifactType: string;
  status: string;
  preview: string;
  updatedAt: string;
  createdAt: string;
};

type ArtifactDetail = {
  id: string;
  title: string;
  artifactType: string;
  status: string;
  payload: Record<string, unknown>;
  view?: LearningArtifactView;
  sourceNodeRefs: Array<{ refType: string; refId: string }>;
  sourceClaimIds: string[];
  sourceChunkIds: string[];
  createdAt: string;
  updatedAt: string;
};

type LearningArtifactView = {
  purpose: string;
  studentAction: string;
  status: string;
  sourceRefs: Array<{ refType: string; refId: string }>;
  objectiveRefs: Array<{ refType: string; refId: string }>;
  confidence: number | null;
  quality: { sourceBacked: boolean; needsReview: boolean; issues: string[] };
  sections: Array<{ id: string; title: string; kind: string; content: unknown; emptyMessage?: string }>;
};

type QuizQuestion = {
  id: string;
  conceptId?: string;
  prompt: string;
  referenceAnswer?: string;
  explanation?: string;
};

type Flashcard = {
  id: string;
  conceptId?: string;
  front: string;
  back: string;
};

type NotebookSettings = {
  artifactConsent?: {
    autoCreateLearnerArtifacts?: boolean;
    autoCreateNotes?: boolean;
  };
};

export type TutorSessionInsights = {
  turnCount: number;
  summary: string;
  taughtPoints: string[];
  doubts: string[];
  nextSteps: string[];
};

interface TutorPanelProps {
  notebookId: string;
  selectedNodeRefs?: SelectedNodeRef[];
}

const SELECTED_REF_LABELS: Record<string, string> = {
  source: "source",
  topic: "topic",
  concept: "concept",
  wiki_page: "wiki page",
  artifact: "artifact",
  session: "session",
  curriculum: "curriculum",
  curriculum_module: "module",
  objective: "objective",
  objective_list: "session objectives",
  study_plan: "Live Plan",
  session_plan: "session",
};

export default function TutorPanel({ notebookId, selectedNodeRefs = [] }: TutorPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"learn" | "practice" | "revise" | "explore" | "wiki_maintenance">("learn");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [liveTraceRun, setLiveTraceRun] = useState<LiveTraceRun | null>(null);
  const [traceData, setTraceData] = useState<ChatTraceResponse | null>(null);
  const [studyState, setStudyState] = useState<StudyState | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [settings, setSettings] = useState<NotebookSettings>({});
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "questions" | "answers">("all");
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
  const [showStudyPlanModal, setShowStudyPlanModal] = useState(false);
  const [artifactTitleDraft, setArtifactTitleDraft] = useState("");
  const [artifactMarkdownDraft, setArtifactMarkdownDraft] = useState("");
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [isArtifactLoading, setIsArtifactLoading] = useState(false);
  const [isArtifactSaving, setIsArtifactSaving] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactDetail | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardRevealed, setFlashcardRevealed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"active" | "paused" | "completed" | null>(null);
  const [isSessionLifecycleLoading, setIsSessionLifecycleLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const traceRefreshTimerRef = useRef<number | null>(null);
  const sessionStatusRef = useRef(sessionStatus);

  React.useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  // Use a ref so the factory always reads the latest refs without recreating the connection
  const selectedNodeRefsRef = useRef(selectedNodeRefs);
  React.useEffect(() => {
    selectedNodeRefsRef.current = buildTutorSelectedNodeRefs(selectedNodeRefs, selectedArtifact?.id ?? null);
  }, [selectedNodeRefs, selectedArtifact?.id]);

  React.useEffect(() => {
    const handleDraftPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: unknown; mode?: unknown }>).detail;
      if (!detail || typeof detail.prompt !== "string") return;
      setInput(detail.prompt);
      if (detail.mode === "wiki_maintenance") {
        setMode("wiki_maintenance");
      }
    };
    window.addEventListener("studyagent:tutor-draft-prompt", handleDraftPrompt);
    return () => window.removeEventListener("studyagent:tutor-draft-prompt", handleDraftPrompt);
  }, []);

  const selectedSessionRefId = useMemo(() => selectedNodeRefs.find((ref) => ref.refType === "session")?.refId ?? null, [selectedNodeRefs]);

  React.useEffect(() => {
    if (!selectedSessionRefId) return;
    setSessionId(selectedSessionRefId);
    setSelectedHistorySessionId(selectedSessionRefId);
  }, [selectedSessionRefId]);

  const modeRef = useRef(mode);
  React.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const tutorActionRef = useRef<"prompt" | "steer" | "followUp">("prompt");

  const connection = useMemo(
    () =>
      fetchServerSentEvents(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/chat`, () => ({
        body: {
          data: {
            activeMode: modeRef.current,
            selectedNodeRefs: selectedNodeRefsRef.current,
            action: tutorActionRef.current,
            ...(sessionId ? { sessionId } : {}),
          },
        },
      })),
    [notebookId, sessionId],
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadSidebarData = React.useCallback(async () => {
    try {
      const [studyRes, artifactsRes, settingsRes] = await Promise.all([
        fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/study-state`),
        fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts`),
        fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/settings`),
      ]);

      if (studyRes.ok) {
        const nextStudyState = (await studyRes.json()) as StudyState;
        setStudyState(nextStudyState);
        const activeSession = nextStudyState.tutorSession?.active;
        if (selectedSessionRefId) {
          setSessionId(selectedSessionRefId);
          setSessionStatus(activeSession?.id === selectedSessionRefId ? (activeSession.status === "paused" ? "paused" : "active") : null);
        } else if (activeSession && activeSession.status !== "completed") {
          setSessionId(activeSession.id);
          setSessionStatus(activeSession.status === "paused" ? "paused" : "active");
        } else if (!activeSession && sessionStatusRef.current !== "completed") {
          setSessionId(null);
          setSessionStatus(null);
        }
      } else {
        setStudyState(null);
      }

      if (artifactsRes.ok) {
        const payload = (await artifactsRes.json()) as { artifacts: ArtifactSummary[] };
        setArtifacts((payload.artifacts ?? []).filter((artifact) => artifact.artifactType !== "teaching_arc"));
      } else {
        setArtifacts([]);
      }

      if (settingsRes.ok) {
        const payload = (await settingsRes.json()) as { settings: NotebookSettings };
        setSettings(payload.settings ?? {});
      } else {
        setSettings({});
      }
    } catch {
      setStudyState(null);
      setArtifacts([]);
      setSettings({});
    }
  }, [notebookId, selectedSessionRefId]);

  const loadTraceData = React.useCallback(async () => {
    try {
      const url = sessionId
        ? `/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/trace?limit=80&sessionId=${encodeURIComponent(sessionId)}`
        : `/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/trace?limit=80`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setTraceData((await res.json()) as ChatTraceResponse);
      setLiveTraceRun(null);
    } catch {
      setTraceData(null);
    }
  }, [notebookId, sessionId]);

  const scheduleTraceDataRefresh = React.useCallback(() => {
    void loadTraceData();
    if (traceRefreshTimerRef.current != null) {
      window.clearTimeout(traceRefreshTimerRef.current);
    }
    traceRefreshTimerRef.current = window.setTimeout(() => {
      traceRefreshTimerRef.current = null;
      void loadTraceData();
    }, 900);
  }, [loadTraceData]);

  const updateArtifactConsentSetting = async (key: "autoCreateLearnerArtifacts" | "autoCreateNotes", value: boolean) => {
    const previous = settings;
    const next = {
      ...settings,
      artifactConsent: {
        ...(settings.artifactConsent ?? {}),
        [key]: value,
      },
    };
    setSettings(next);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactConsent: { [key]: value } }),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as { settings: NotebookSettings };
      setSettings(payload.settings ?? next);
    } catch (err) {
      setSettings(previous);
      setArtifactError(err instanceof Error ? err.message : "Failed to update artifact consent settings");
    }
  };

  const openArtifact = React.useCallback(
    async (artifactId: string) => {
      setArtifactError(null);
      setIsArtifactLoading(true);
      try {
        const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(artifactId)}`);
        if (!res.ok) {
          throw new Error(`Failed to load artifact (${res.status})`);
        }
        const payload = (await res.json()) as { artifact: ArtifactDetail };
        setSelectedArtifact(payload.artifact);
        setArtifactTitleDraft(payload.artifact.title);
        setArtifactMarkdownDraft(typeof payload.artifact.payload.markdown === "string" ? payload.artifact.payload.markdown : "");
        setQuizFeedback(null);
        setFlashcardIndex(0);
        setFlashcardRevealed(false);
      } catch (err) {
        setArtifactError(err instanceof Error ? err.message : "Failed to load artifact");
      } finally {
        setIsArtifactLoading(false);
      }
    },
    [notebookId],
  );

  const openStudyPlanModal = () => setShowStudyPlanModal(true);
  const closeStudyPlanModal = () => setShowStudyPlanModal(false);
  const closeArtifact = () => {
    setSelectedArtifact(null);
    setArtifactTitleDraft("");
    setArtifactMarkdownDraft("");
    setArtifactError(null);
    setQuizFeedback(null);
    setFlashcardIndex(0);
    setFlashcardRevealed(false);
  };

  const approveArtifact = async () => {
    if (!selectedArtifact) return;
    setIsArtifactSaving(true);
    setArtifactError(null);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(selectedArtifact.id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as { artifact: ArtifactDetail | null };
      if (payload.artifact) {
        setSelectedArtifact(payload.artifact);
        setArtifactTitleDraft(payload.artifact.title);
        setArtifactMarkdownDraft(typeof payload.artifact.payload.markdown === "string" ? payload.artifact.payload.markdown : "");
      }
      await loadSidebarData();
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : "Failed to approve artifact");
    } finally {
      setIsArtifactSaving(false);
    }
  };

  const rejectArtifact = async () => {
    if (!selectedArtifact) return;
    setIsArtifactSaving(true);
    setArtifactError(null);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(selectedArtifact.id)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected from tutor panel" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as { artifact: ArtifactDetail | null };
      if (payload.artifact) {
        setSelectedArtifact(payload.artifact);
      }
      await loadSidebarData();
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : "Failed to reject artifact");
    } finally {
      setIsArtifactSaving(false);
    }
  };

  const saveArtifact = async () => {
    if (!selectedArtifact || selectedArtifact.artifactType !== "note") return;
    setIsArtifactSaving(true);
    setArtifactError(null);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(selectedArtifact.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: artifactTitleDraft,
          noteMarkdown: artifactMarkdownDraft,
          status: "ready",
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const payload = (await res.json()) as { artifact: ArtifactDetail | null };
      if (payload.artifact) {
        setSelectedArtifact(payload.artifact);
        setArtifactTitleDraft(payload.artifact.title);
        setArtifactMarkdownDraft(typeof payload.artifact.payload.markdown === "string" ? payload.artifact.payload.markdown : "");
      }
      await loadSidebarData();
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : "Failed to save artifact");
    } finally {
      setIsArtifactSaving(false);
    }
  };

  const { messages, sendMessage, isLoading, error, clear } = useChat({
    connection,
    onChunk(chunk) {
      // Capture sessionId from SESSION_STARTED event (custom event not in standard types)
      const chunkAny = chunk as any;
      if (chunkAny.type === "SESSION_STARTED" && chunkAny.sessionId && !sessionId) {
        setSessionId(chunkAny.sessionId);
        setSessionStatus("active");
      }
      setLiveTraceRun((prev) => updateLiveTraceRun(prev, chunkAny));
      if (chunk.type === "RUN_STARTED") {
        setRunStatus("running");
      } else if (chunk.type === "RUN_FINISHED") {
        tutorActionRef.current = "prompt";
        setRunStatus("completed");
        void loadSidebarData();
        scheduleTraceDataRefresh();
      } else if (chunk.type === "RUN_ERROR") {
        tutorActionRef.current = "prompt";
        setRunStatus("failed");
        void loadSidebarData();
        scheduleTraceDataRefresh();
      }
    },
    onError() {
      setRunStatus("failed");
      setLiveTraceRun((prev) => (prev ? { ...prev, status: "failed", completedAt: Date.now() } : prev));
    },
  });

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, traceData?.turns.length]);

  React.useEffect(() => {
    void loadTraceData();
  }, [loadTraceData]);

  React.useEffect(() => {
    clear();
    setInput("");
    setRunStatus("idle");
    setLiveTraceRun(null);
    setSessionId(null);
    setSessionStatus(null);
    closeArtifact();
    void loadSidebarData();
    void loadTraceData();
    return () => {
      if (traceRefreshTimerRef.current != null) {
        window.clearTimeout(traceRefreshTimerRef.current);
        traceRefreshTimerRef.current = null;
      }
    };
  }, [notebookId]);

  React.useEffect(() => {
    void loadSidebarData();
  }, [loadSidebarData]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setSelectedHistorySessionId(null);
    tutorActionRef.current = isLoading ? "steer" : "prompt";
    setRunStatus("running");
    setLiveTraceRun(null);
    setInput("");
    
    // sendMessage will use the connection which includes sessionId and action if available
    await sendMessage(input);
  };

  const handleSessionPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const noteOwnerType =
    selectedArtifact && typeof selectedArtifact.payload.blockOwnerType === "string"
      ? selectedArtifact.payload.blockOwnerType
      : "agent";
  const quizQuestions = toQuizQuestions(selectedArtifact?.payload.questions);
  const flashcards = toFlashcards(selectedArtifact?.payload.cards);
  const activeFlashcard = flashcards[flashcardIndex] ?? null;
  const currentObjectiveTitle = studyState?.studyPlan?.currentObjective?.title ?? null;
  const upcomingObjectiveTitle = studyState?.studyPlan?.upcomingObjectives[0]?.title ?? null;
  const completedObjectiveCount = studyState?.studyPlan?.completedObjectives.length ?? 0;
  const planStatusLabel =
    currentObjectiveTitle ??
    (studyState?.curriculum ? "Ready for a tutoring session" : "Add sources to build a course");
  const sessionActionLabel =
    studyState?.tutorSession?.suggestedAction === "continue_session"
      ? studyState.tutorSession.active?.status === "paused"
        ? "Resume session"
        : "Continue session"
      : studyState?.tutorSession?.suggestedAction === "review_completed"
        ? "Start next lesson"
        : studyState?.tutorSession?.suggestedAction === "build_curriculum"
          ? "Plan course"
          : "Start session";
  const sessionPrompt =
    studyState?.tutorSession?.suggestedAction === "continue_session"
      ? studyState.tutorSession.active?.status === "paused"
        ? "Resume the paused tutoring session from where we left off."
        : "Continue the tutoring session from where we left off."
      : studyState?.tutorSession?.suggestedAction === "review_completed"
        ? "Start the next lesson based on my completed session and current study plan."
        : studyState?.tutorSession?.suggestedAction === "build_curriculum"
          ? "Build a curriculum from my uploaded sources and start with the best first topic."
          : "Start a tutoring session for this notebook.";
  const reviewLastSessionPrompt = "Review the last completed session and suggest what I should do next.";
  const historySessions = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return buildHistorySessions(traceData)
      .filter((session) => {
        if (!query) return true;
        const question = session.firstUserMessage.toLowerCase();
        const answer = session.latestAssistantMessage.toLowerCase();
        if (historyFilter === "questions") return question.includes(query);
        if (historyFilter === "answers") return answer.includes(query);
        return question.includes(query) || answer.includes(query) || session.title.toLowerCase().includes(query);
      })
      .reverse();
  }, [historyFilter, historySearch, traceData?.turns]);
  const selectedHistoryTraceData = useMemo(() => traceDataForSession(traceData, selectedHistorySessionId), [selectedHistorySessionId, traceData]);
  const activeTraceData = selectedHistoryTraceData ?? traceData;
  const persistedMessages = useMemo(() => messagesFromTraceData(activeTraceData), [activeTraceData]);
  const sessionInsights = useMemo(() => buildTutorSessionInsights(activeTraceData), [activeTraceData]);
  const displayMessages = useMemo(
    () => selectedHistoryTraceData ? persistedMessages : mergePersistedAndLiveMessages(persistedMessages, messages),
    [messages, persistedMessages, selectedHistoryTraceData],
  );

  const submitQuizAttempt = async (question: QuizQuestion, isCorrect: boolean) => {
    if (!selectedArtifact) return;
    setArtifactError(null);
    setQuizFeedback(null);
    try {
      const res = await fetch(
        `/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(selectedArtifact.id)}/quiz-attempts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            answer: isCorrect ? "understood" : "needs_review",
            isCorrect,
            conceptIds: question.conceptId ? [question.conceptId] : [],
          }),
        },
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await loadSidebarData();
      setQuizFeedback(
        isCorrect
          ? `Recorded as understood. ${question.explanation ?? question.referenceAnswer ?? ""}`.trim()
          : `Recorded for review. ${question.explanation ?? question.referenceAnswer ?? ""}`.trim(),
      );
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : "Failed to record quiz attempt");
    }
  };

  const submitFlashcardReview = async (result: "again" | "hard" | "good" | "easy") => {
    if (!selectedArtifact || !activeFlashcard) return;
    setArtifactError(null);
    setQuizFeedback(null);
    try {
      const res = await fetch(
        `/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(selectedArtifact.id)}/flashcard-reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: activeFlashcard.id,
            result,
            conceptIds: activeFlashcard.conceptId ? [activeFlashcard.conceptId] : [],
          }),
        },
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await loadSidebarData();
      setFlashcardRevealed(false);
      setFlashcardIndex((index) => (flashcards.length ? (index + 1) % flashcards.length : 0));
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : "Failed to record flashcard review");
    }
  };

  const handlePauseSession = async () => {
    if (!sessionId) return;
    setIsSessionLifecycleLoading(true);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/session/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { status: string };
      setSessionStatus("paused");
    } catch (err) {
      console.error("Failed to pause session:", err);
    } finally {
      setIsSessionLifecycleLoading(false);
    }
  };

  const handleResumeSession = async () => {
    if (!sessionId) return;
    setIsSessionLifecycleLoading(true);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/session/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { status: string };
      setSessionStatus("active");
    } catch (err) {
      console.error("Failed to resume session:", err);
    } finally {
      setIsSessionLifecycleLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    setIsSessionLifecycleLoading(true);
    try {
      const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { status: string; artifactId?: string };
      setSessionStatus("completed");
      if (data.artifactId) {
        await loadSidebarData();
      }
    } catch (err) {
      console.error("Failed to end session:", err);
    } finally {
      setIsSessionLifecycleLoading(false);
    }
  };

  const handleNewChat = async () => {
    const currentSessionId = sessionId;
    setIsSessionLifecycleLoading(true);
    try {
      if (currentSessionId && sessionStatus !== "completed") {
        const res = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/session/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSessionId }),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
      }
      clear();
      setInput("");
      setRunStatus("idle");
      setLiveTraceRun(null);
      setTraceData(null);
      setSessionId(null);
      setSessionStatus(null);
      setSelectedHistorySessionId(null);
      tutorActionRef.current = "prompt";
      await loadSidebarData();
    } catch (err) {
      console.error("Failed to start a new chat:", err);
    } finally {
      setIsSessionLifecycleLoading(false);
    }
  };

  return (
    <div className="tutor-shell" style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 300, position: "relative", color: "var(--text)" }}>
      <div className="tutor-header">
        <div className="tutor-compact-row">
          <div style={{ minWidth: 0 }}>
            <strong className="tutor-title">Tutor</strong>
            <span className="tutor-subtitle">
              {currentObjectiveTitle ?? planStatusLabel}
            </span>
          </div>
          <div className="tutor-header-actions">
            <button type="button" className="study-chip-button" onClick={() => void handleNewChat()} disabled={isSessionLifecycleLoading || isLoading}>
              New chat
            </button>
            <button type="button" className="study-chip-button" data-active={showHistory} onClick={() => setShowHistory((value) => !value)}>
              History
            </button>
            {sessionId && (
              <div className="tutor-session-controls" aria-label={`Session ${sessionStatus ?? "idle"}`}>
                <span className="tutor-session-dot" data-status={sessionStatus ?? "idle"} />
                {sessionStatus === "active" && (
                  <>
                    <button type="button" onClick={() => void handlePauseSession()} disabled={isSessionLifecycleLoading} className="study-chip-button">
                      Pause
                    </button>
                    <button type="button" onClick={() => void handleEndSession()} disabled={isSessionLifecycleLoading} className="study-chip-button" data-variant="danger">
                      End
                    </button>
                  </>
                )}
                {sessionStatus === "paused" && (
                  <>
                    <button type="button" onClick={() => void handleResumeSession()} disabled={isSessionLifecycleLoading} className="study-chip-button">
                      Resume
                    </button>
                    <button type="button" onClick={() => void handleEndSession()} disabled={isSessionLifecycleLoading} className="study-chip-button" data-variant="danger">
                      End
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="tutor-control-row">
          <label className="tutor-mode-select">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="learn">Learn</option>
              <option value="practice">Practice</option>
              <option value="revise">Revise</option>
              <option value="explore">Explore</option>
              <option value="wiki_maintenance">Source Wiki</option>
            </select>
          </label>
          {studyState && (
            <button
              type="button"
              onClick={() => handleSessionPrompt(sessionPrompt)}
              className="study-primary-button tutor-start-button"
            >
              {sessionActionLabel}
            </button>
          )}
          <button type="button" onClick={openStudyPlanModal} className="study-chip-button">
            Plan
          </button>
          {studyState?.tutorSession?.suggestedAction === "review_completed" && (
            <button type="button" onClick={() => handleSessionPrompt(reviewLastSessionPrompt)} className="study-chip-button">
              Review
            </button>
          )}
        </div>
        {showHistory && (
          <div className="tutor-history-panel">
            <div className="tutor-history-tools">
              <input
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search previous chats"
                aria-label="Search previous chats"
              />
              <select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value as typeof historyFilter)} aria-label="Filter chat history">
                <option value="all">All</option>
                <option value="questions">Questions</option>
                <option value="answers">Answers</option>
              </select>
            </div>
            <div className="tutor-history-list">
              {historySessions.length > 0 ? (
                historySessions.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    className="tutor-history-item"
                    data-active={selectedHistorySessionId === session.sessionId}
                    onClick={() => {
                      setSelectedHistorySessionId(session.sessionId);
                      setShowHistory(false);
                      setInput("");
                    }}
                  >
                    <span>
                      {new Date(session.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {" · "}
                      {session.turnCount} {session.turnCount === 1 ? "turn" : "turns"}
                    </span>
                    <strong>{session.title}</strong>
                    {session.latestAssistantMessage && <em>{session.latestAssistantMessage}</em>}
                  </button>
                ))
              ) : (
                <div className="tutor-history-empty">{traceData ? "No matching sessions." : "No previous sessions loaded yet."}</div>
              )}
            </div>
          </div>
        )}
        {selectedNodeRefs.length > 0 && (
          <div className="tutor-selected-context">
            Using selected {selectedNodeRefs.map((r) => SELECTED_REF_LABELS[r.refType] ?? r.refType.replace(/_/g, " ")).join(", ")}
          </div>
        )}
        <details className="tutor-reference-options">
          <summary>Reference options</summary>
          <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>ARTIFACT CONSENT</div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#4b5563", marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={settings.artifactConsent?.autoCreateLearnerArtifacts === true}
              onChange={(e) => void updateArtifactConsentSetting("autoCreateLearnerArtifacts", e.target.checked)}
            />
            Auto-create learner study aids
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#4b5563" }}>
            <input
              type="checkbox"
              checked={settings.artifactConsent?.autoCreateNotes === true}
              onChange={(e) => void updateArtifactConsentSetting("autoCreateNotes", e.target.checked)}
            />
            Auto-promote generated notes
          </label>
          <div style={{ marginTop: 4, fontSize: 10, color: "#6b7280", lineHeight: 1.35 }}>
            When disabled, tutor-created learner aids stay proposed/draft until approved.
          </div>
          </div>
        </details>

      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: "var(--panel)",
        }}
      >
        {displayMessages.length === 0 && (
          <div className="tutor-empty-thread">
            <strong>Start from the material, not a blank chat</strong>
            <p>Ask for a plan, inspect a selected graph node, or have the tutor turn sources into a first lesson route.</p>
            <div className="tutor-suggestion-list">
              {[sessionPrompt, "Explain the current objective with evidence from my sources.", "Show me what is missing from this notebook."].map((prompt) => (
                <button key={prompt} type="button" onClick={() => handleSessionPrompt(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedHistoryTraceData && (
          <div className="tutor-history-viewing">
            <span>Viewing previous session</span>
            <button type="button" onClick={() => setSelectedHistorySessionId(null)}>
              Back to current
            </button>
          </div>
        )}
        {sessionInsights.turnCount > 0 && (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <strong style={{ fontSize: 13, color: "#111827" }}>Session insights</strong>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{sessionInsights.summary}</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <SessionInsightList title="What was taught" items={sessionInsights.taughtPoints} emptyMessage="No teaching notes yet." />
              <SessionInsightList title="Doubts and friction" items={sessionInsights.doubts} emptyMessage="No explicit doubts captured yet." />
              <SessionInsightList title="Next steps" items={sessionInsights.nextSteps} emptyMessage="Continue the current session goal." />
            </div>
          </section>
        )}
        {displayMessages.map((msg, index) => {
          const traceTurn = traceTurnForAssistantMessage(displayMessages, index, activeTraceData);
          const latestUserIndex = latestUserMessageIndex(displayMessages);
          const isLatestAssistant = msg.role !== "user" && index === latestAssistantMessageIndex(displayMessages);
          const isActiveAssistantTurn = isLatestAssistant && index > latestUserIndex;
          const showLiveForMessage = isActiveAssistantTurn && runStatus === "running";
          return (
            <div
              key={msg.id}
              className="tutor-message"
              data-role={msg.role === "user" ? "user" : "assistant"}
            >
              {msg.role !== "user" && (
                <AgentTrace
                  traceTurn={showLiveForMessage ? null : traceTurn}
                  liveRun={isActiveAssistantTurn ? liveTraceRun : null}
                  runStatus={isActiveAssistantTurn ? runStatus : "idle"}
                />
              )}
              {renderMessage(msg)}
            </div>
          );
        })}
        {isLoading && (
          <div>
            <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>Tutor is responding...</div>
            {latestAssistantMessageIndex(displayMessages) <= latestUserMessageIndex(displayMessages) && (
              <AgentTrace traceTurn={null} liveRun={liveTraceRun} runStatus={runStatus} />
            )}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", padding: 6, borderRadius: 4 }}>
            Error: {error.message}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="tutor-composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the tutor..."
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim()}
          className="study-primary-button"
          style={{ opacity: !input.trim() ? 0.55 : 1, cursor: !input.trim() ? "not-allowed" : "pointer" }}
        >
          {isLoading ? "Steer current response" : "Send"}
        </button>
      </div>

      {selectedArtifact && (
        <div
          style={{
            position: "absolute",
            inset: 16,
            background: "white",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 20,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{selectedArtifact.title}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {selectedArtifact.artifactType} · {selectedArtifact.status}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {(selectedArtifact.status === "proposed" || selectedArtifact.status === "draft") && (
                <>
                  <button
                    type="button"
                    onClick={() => void approveArtifact()}
                    disabled={isArtifactSaving}
                    style={{ padding: "6px 9px", border: "1px solid #86efac", background: "#dcfce7", color: "#166534", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: isArtifactSaving ? "not-allowed" : "pointer" }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectArtifact()}
                    disabled={isArtifactSaving}
                    style={{ padding: "6px 9px", border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: isArtifactSaving ? "not-allowed" : "pointer" }}
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={closeArtifact}
                style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#6b7280" }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {isArtifactLoading && <div style={{ fontSize: 12, color: "#6b7280" }}>Loading artifact…</div>}
            {artifactError && (
              <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", padding: 8, borderRadius: 6 }}>{artifactError}</div>
            )}
            {selectedArtifact.view && <LearningArtifactOverview view={selectedArtifact.view} />}

            {selectedArtifact.artifactType === "note" ? (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>TITLE</span>
                  <input
                    value={artifactTitleDraft}
                    onChange={(e) => setArtifactTitleDraft(e.target.value)}
                    style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
                  />
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ background: noteOwnerType === "human" ? "#d1fae5" : "#fef3c7", color: noteOwnerType === "human" ? "#065f46" : "#92400e", padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600 }}>
                    {noteOwnerType === "human" ? "human-edited" : "generated"}
                  </span>
                  {selectedArtifact.sourceNodeRefs.length > 0 && (
                    <span style={{ background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600 }}>
                      {selectedArtifact.sourceNodeRefs.length} source ref{selectedArtifact.sourceNodeRefs.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>NOTE MARKDOWN</span>
                  <textarea
                    value={artifactMarkdownDraft}
                    onChange={(e) => setArtifactMarkdownDraft(e.target.value)}
                    style={{
                      minHeight: 220,
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      padding: 10,
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      resize: "vertical",
                    }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setInput(`Help me improve the note "${artifactTitleDraft || selectedArtifact.title}" using grounded evidence from this notebook.`)}
                    style={{
                      padding: "8px 10px",
                      background: "#f3f4f6",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Ask Tutor About This Note
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveArtifact()}
                    disabled={isArtifactSaving}
                    style={{
                      padding: "8px 12px",
                      background: isArtifactSaving ? "#93c5fd" : "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isArtifactSaving ? "not-allowed" : "pointer",
                    }}
                  >
                    {isArtifactSaving ? "Saving…" : "Save Note"}
                  </button>
                </div>
              </>
            ) : selectedArtifact.artifactType === "quiz" ? (
              <>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>QUIZ QUESTIONS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {quizQuestions.map((question, index) => (
                    <div key={question.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Question {index + 1}</div>
                      <div style={{ fontSize: 13, color: "#111827", marginBottom: 8 }}>{question.prompt}</div>
                      {(question.referenceAnswer || question.explanation) && (
                        <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5, marginBottom: 8 }}>
                          <strong>Review:</strong> {question.referenceAnswer ?? question.explanation}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => void submitQuizAttempt(question, true)}
                          style={{
                            padding: "7px 10px",
                            background: "#d1fae5",
                            color: "#065f46",
                            border: "1px solid #86efac",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          I got this
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitQuizAttempt(question, false)}
                          style={{
                            padding: "7px 10px",
                            background: "#fee2e2",
                            color: "#991b1b",
                            border: "1px solid #fca5a5",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Needs review
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : selectedArtifact.artifactType === "flashcards" ? (
              <>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>FLASHCARDS</div>
                {activeFlashcard ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div
                      style={{
                        border: "1px solid #d1d5db",
                        borderRadius: 10,
                        padding: 16,
                        background: flashcardRevealed ? "#f0fdf4" : "#eff6ff",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                        Card {flashcardIndex + 1} of {flashcards.length}
                      </div>
                      <div style={{ fontSize: 14, color: "#111827", fontWeight: 600, marginBottom: 10 }}>
                        {flashcardRevealed ? activeFlashcard.back : activeFlashcard.front}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFlashcardRevealed((value) => !value)}
                        style={{
                          padding: "7px 10px",
                          background: "white",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {flashcardRevealed ? "Show prompt" : "Reveal answer"}
                      </button>
                    </div>
                    {flashcardRevealed && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(["again", "hard", "good", "easy"] as const).map((result) => (
                          <button
                            key={result}
                            type="button"
                            onClick={() => void submitFlashcardReview(result)}
                            style={{
                              padding: "7px 10px",
                              background: result === "again" ? "#fee2e2" : result === "hard" ? "#ffedd5" : "#dbeafe",
                              color: result === "again" ? "#991b1b" : result === "hard" ? "#9a3412" : "#1d4ed8",
                              border: "1px solid #d1d5db",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              textTransform: "capitalize",
                            }}
                          >
                            {result}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No cards available yet.</div>
                )}
              </>
            ) : selectedArtifact.artifactType === "worked_example" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>WORKED EXAMPLE</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{String(selectedArtifact.payload.problemStatement ?? selectedArtifact.title)}</div>
                {Array.isArray(selectedArtifact.payload.solutionSteps) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedArtifact.payload.solutionSteps.map((step: unknown, index: number) => (
                      <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fafafa" }}>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Step {index + 1}</div>
                        <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.5 }}>{String(step)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {Array.isArray(selectedArtifact.payload.commonMistakes) && selectedArtifact.payload.commonMistakes.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>COMMON MISTAKES</div>
                    {selectedArtifact.payload.commonMistakes.map((item: unknown, index: number) => (
                      <div key={index} style={{ fontSize: 12, color: "#7c2d12", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: 8 }}>
                        {String(item)}
                      </div>
                    ))}
                  </div>
                )}
                {typeof selectedArtifact.payload.finalTakeaway === "string" && (
                  <div style={{ fontSize: 13, color: "#111827", background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: 10 }}>
                    <strong>Takeaway:</strong> {selectedArtifact.payload.finalTakeaway}
                  </div>
                )}
              </div>
            ) : selectedArtifact.artifactType === "formula_sheet" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>FORMULA SHEET</div>
                {Array.isArray(selectedArtifact.payload.formulas) && selectedArtifact.payload.formulas.length > 0 ? (
                  selectedArtifact.payload.formulas.map((formula: any) => (
                    <div key={formula.symbol ?? formula.expression} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fafafa" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{formula.symbol}</div>
                      <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{formula.expression}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{formula.meaning}</div>
                      {(formula.assumptions || formula.units || formula.exampleUsage) && (
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {formula.assumptions && <div><strong>Assumptions:</strong> {formula.assumptions}</div>}
                          {formula.units && <div><strong>Units:</strong> {formula.units}</div>}
                          {formula.exampleUsage && <div><strong>Example:</strong> {formula.exampleUsage}</div>}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No formulas available yet.</div>
                )}
              </div>
            ) : selectedArtifact.artifactType === "comparison_page" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>COMPARISON PAGE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>{String(selectedArtifact.payload.leftTitle ?? "Left")}</div>
                  <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, color: "#6d28d9" }}>{String(selectedArtifact.payload.rightTitle ?? "Right")}</div>
                </div>
                {Array.isArray(selectedArtifact.payload.comparisonRows) && selectedArtifact.payload.comparisonRows.length > 0 ? (
                  selectedArtifact.payload.comparisonRows.map((row: any) => (
                    <div key={row.dimension} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fafafa" }}>
                      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>{row.dimension}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "#111827" }}>
                        <div>{row.left}</div>
                        <div>{row.right}</div>
                      </div>
                      {row.takeaway && <div style={{ marginTop: 8, fontSize: 12, color: "#4b5563" }}><strong>Takeaway:</strong> {row.takeaway}</div>}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>No comparison rows available yet.</div>
                )}
              </div>
            ) : (
              <>
                {typeof selectedArtifact.payload.summary === "string" && (
                  <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.6 }}>{selectedArtifact.payload.summary}</div>
                )}
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>REFERENCE FIELDS</div>
                <ReadableArtifactPayload payload={selectedArtifact.payload} />
              </>
            )}
            {quizFeedback && (
              <div style={{ fontSize: 12, color: "#1f2937", background: "#f3f4f6", padding: 8, borderRadius: 6 }}>{quizFeedback}</div>
            )}
          </div>
        </div>
      )}

      {showStudyPlanModal && studyState && (
        <div
          style={{
            position: "absolute",
            inset: 16,
            zIndex: 25,
            background: "white",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #e5e7eb",
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Live Plan</div>
            <button
              type="button"
              onClick={closeStudyPlanModal}
              style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#6b7280" }}
            >
              ×
            </button>
          </div>
          <div style={{ padding: 12, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>
              <strong>Current objective:</strong> {studyState.studyPlan?.currentObjective?.title ?? "No active objective"}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              <strong>Session goal:</strong> {studyState.sessionPlan?.sessionGoal ?? "Not set"}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>UPCOMING OBJECTIVES</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#111827", lineHeight: 1.5 }}>
                {(studyState.studyPlan?.upcomingObjectives ?? []).map((objective) => (
                  <li key={objective.id}>{objective.title}</li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>RECENTLY COMPLETED</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#111827", lineHeight: 1.5 }}>
                {(studyState.studyPlan?.completedObjectives ?? []).slice(-5).map((objective) => (
                  <li key={objective.id}>{objective.title}</li>
                ))}
              </ul>
            </div>
            {(studyState.studyPlan?.weakConcepts.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>WEAK CONCEPTS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(studyState.studyPlan?.weakConcepts ?? []).map((concept) => (
                    <span key={concept.id} style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 9999, fontSize: 11 }}>
                      {concept.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function buildTutorSelectedNodeRefs(baseRefs: SelectedNodeRef[], selectedArtifactId: string | null): SelectedNodeRef[] {
  const merged = [...baseRefs];
  if (selectedArtifactId) {
    merged.push({ refType: "artifact", refId: selectedArtifactId });
  }
  const seen = new Set<string>();
  return merged.filter((ref) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildTutorSessionInsights(traceData: ChatTraceResponse | null): TutorSessionInsights {
  const turns = traceData?.turns ?? [];
  const taughtPoints: string[] = [];
  const doubts: string[] = [];
  for (const turn of turns) {
    if (turn.assistantMessage && taughtPoints.length < 4) {
      const snippet = summarizeTutorInsight(turn.assistantMessage);
      if (snippet && !taughtPoints.includes(snippet)) {
        taughtPoints.push(snippet);
      }
    }
    if (turn.userMessage && looksLikeTutorDoubt(turn.userMessage)) {
      const snippet = summarizeTutorInsight(turn.userMessage);
      if (snippet && !doubts.includes(snippet)) {
        doubts.push(snippet);
      }
    }
  }

  const lastAssistantMessage = [...turns].reverse().find((turn) => typeof turn.assistantMessage === "string" && turn.assistantMessage.trim());
  const nextSteps = lastAssistantMessage?.assistantMessage
    ? [summarizeTutorInsight(lastAssistantMessage.assistantMessage, 160)].filter(Boolean)
    : ["Continue the current session goal in tutor chat."];

  return {
    turnCount: turns.length,
    summary: turns.length > 0 ? `${turns.length} turn${turns.length === 1 ? "" : "s"} captured` : "No turns recorded yet",
    taughtPoints: taughtPoints.length > 0 ? taughtPoints : ["No teaching notes yet."],
    doubts: doubts.length > 0 ? doubts : ["No explicit doubts captured yet."],
    nextSteps,
  };
}

function summarizeTutorInsight(text: string, maxLength = 140): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function looksLikeTutorDoubt(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return /\?|confus|stuck|unclear|don't understand|do not understand|why|how/.test(normalized);
}

function SessionInsightList({ title, items, emptyMessage }: { title: string; items: string[]; emptyMessage: string }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div key={item} style={{ padding: "8px 10px", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", color: "#374151", lineHeight: 1.45 }}>
            {item}
          </div>
        ))}
        {items.length === 0 && <div style={{ color: "#6b7280" }}>{emptyMessage}</div>}
      </div>
    </div>
  );
}

export function traceTurnForAssistantMessage(
  messages: UIMessage[],
  messageIndex: number,
  traceData: ChatTraceResponse | null,
): ChatTraceTurn | null {
  if (!traceData || messages[messageIndex]?.role === "user") return null;
  const userMessage = nearestPreviousUserMessageText(messages, messageIndex);
  if (userMessage) {
    const matchingTurns = traceData.turns.filter((turn) => turn.userMessage?.trim() === userMessage);
    if (matchingTurns.length > 0) {
      const priorMatchingAssistantMessages = messages
        .slice(0, messageIndex + 1)
        .filter((message, index) => message.role !== "user" && nearestPreviousUserMessageText(messages, index) === userMessage)
        .length;
      return matchingTurns[Math.min(priorMatchingAssistantMessages - 1, matchingTurns.length - 1)] ?? matchingTurns[matchingTurns.length - 1] ?? null;
    }
  }
  const assistantIndex = messages.slice(0, messageIndex + 1).filter((message) => message.role !== "user").length - 1;
  return traceData.turns[assistantIndex] ?? null;
}

export function latestAssistantMessageIndex(messages: UIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") return index;
  }
  return -1;
}

export function latestUserMessageIndex(messages: UIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

export function messagesFromTraceData(traceData: ChatTraceResponse | null): UIMessage[] {
  if (!traceData) return [];
  return traceData.turns.flatMap((turn) => {
    const items: UIMessage[] = [];
    if (turn.userMessage?.trim()) {
      items.push({
        id: `${turn.id}:user`,
        role: "user",
        parts: [{ type: "text", content: turn.userMessage }],
      } as UIMessage);
    }
    if (turn.assistantMessage?.trim()) {
      items.push({
        id: `${turn.id}:assistant`,
        role: "assistant",
        parts: [{ type: "text", content: turn.assistantMessage }],
      } as UIMessage);
    }
    return items;
  });
}

export function mergePersistedAndLiveMessages(persisted: UIMessage[], live: UIMessage[]): UIMessage[] {
  if (!live.length) return persisted;
  if (!persisted.length) return live;
  const latestLiveUser = [...live].reverse().find((message) => message.role === "user");
  if (latestLiveUser) {
    const latestLiveUserText = messageText(latestLiveUser).trim();
    const persistedHasCompletedLiveTurn = persisted.some((message, index) => {
      if (message.role !== "user" || messageText(message).trim() !== latestLiveUserText) return false;
      return persisted.slice(index + 1).some((candidate) => candidate.role !== "user" && messageText(candidate).trim());
    });
    if (latestLiveUserText && persistedHasCompletedLiveTurn) return persisted;
  }
  if (live.length >= persisted.length) return live;
  return [...persisted, ...live];
}

export function traceDataForTurn(traceData: ChatTraceResponse | null, turnId: string | null): ChatTraceResponse | null {
  if (!traceData || !turnId) return null;
  const turn = traceData.turns.find((item) => item.id === turnId);
  return turn ? { ...traceData, turns: [turn] } : null;
}

type TutorHistorySession = {
  sessionId: string;
  startedAt: string;
  turnCount: number;
  title: string;
  firstUserMessage: string;
  latestAssistantMessage: string;
};

export function buildHistorySessions(traceData: ChatTraceResponse | null): TutorHistorySession[] {
  if (!traceData) return [];
  const sessions = new Map<string, ChatTraceResponse["turns"]>();
  for (const turn of traceData.turns) {
    const turns = sessions.get(turn.sessionId) ?? [];
    turns.push(turn);
    sessions.set(turn.sessionId, turns);
  }
  return [...sessions.entries()]
    .map(([sessionId, turns]) => {
      const sortedTurns = turns.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      const first = sortedTurns[0];
      const latestAssistant = [...sortedTurns].reverse().find((turn) => turn.assistantMessage?.trim());
      const firstUserMessage = first?.userMessage?.trim() ?? "";
      return {
        sessionId,
        startedAt: first?.createdAt ?? new Date(0).toISOString(),
        turnCount: sortedTurns.length,
        title: compactHistoryTitle(firstUserMessage || latestAssistant?.assistantMessage || "Tutor session"),
        firstUserMessage,
        latestAssistantMessage: compactHistoryTitle(latestAssistant?.assistantMessage ?? ""),
      };
    })
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export function traceDataForSession(traceData: ChatTraceResponse | null, sessionId: string | null): ChatTraceResponse | null {
  if (!traceData || !sessionId) return null;
  const turns = traceData.turns.filter((item) => item.sessionId === sessionId);
  return turns.length ? { ...traceData, turns } : null;
}

function compactHistoryTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function renderMessage(message: UIMessage): React.ReactNode {
  const text = messageText(message);
  if (!text) return null;
  const normalized = message.role === "user" ? text : normalizeAssistantMessageText(text);
  return <TutorMessageText text={normalized} />;
}

export function normalizeAssistantMessageText(text: string): string {
  let normalized = text.replace(/\r\n/g, "\n").trim();
  normalized = removeRepeatedPrefix(normalized);
  normalized = normalized
    .replace(/\b(?:chk|clm|src|trace|cnc|artifact|turn|run)_[a-z0-9_]+\b/gi, "")
    .replace(/([a-z])(?=Let me\b)/g, "$1 ")
    .replace(/\(\s*(?:,\s*)+\)/g, "")
    .replace(/\(\s*(?:chunk|claim|source|trace)\s*\)/gi, "")
    .replace(/`+\s*`+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/(?<!\|)[ \t]*---[ \t]*(?!\|)/g, "\n\n")
    .replace(/[ \t]+(#{2,4}\s+)/g, "\n\n$1")
    .replace(/(#{2,4}\s+[^|\n]+?)\s+(\|)/g, "$1\n$2")
    .replace(/\|\s+\|/g, "|\n|")
    .replace(/\|\s+(\|[-: ]+\|)/g, "|\n$1")
    .replace(/[ \t]+(\d+\.\s+\*\*)/g, "\n$1")
    .replace(/[ \t]+([-*]\s+\*\*)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\b(note|notebook|material|anytime)(Now|Here|Great)\b/g, "$1 $2")
    .trim();
  return normalized;
}

function removeRepeatedPrefix(text: string): string {
  const compact = text.replace(/\s+/g, " ");
  const maxPrefix = Math.min(260, Math.floor(compact.length / 2));
  for (let length = maxPrefix; length >= 48; length -= 1) {
    const prefix = compact.slice(0, length);
    const nextIndex = compact.indexOf(prefix, 12);
    if (nextIndex >= length) {
      return compact.slice(0, nextIndex).trim() + " " + compact.slice(nextIndex + length).trim();
    }
  }
  return text;
}

function TutorMessageText({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseTutorTextBlocks(text), [text]);
  return (
    <div className="tutor-rich-text">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h4 key={index}>{renderInlineMarkdown(block.text)}</h4>;
        }
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered-list") {
          return (
            <ol key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="tutor-table-scroll">
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, cellIndex) => (
                      <th key={cellIndex}>{renderInlineMarkdown(header)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

type TutorTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "numbered-list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export function parseTutorTextBlocks(text: string): TutorTextBlock[] {
  const lines = repairTutorMarkdownLines(text).map((line) => line.trim()).filter(Boolean);
  const blocks: TutorTextBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let numberedList: string[] = [];
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: cleanTutorInlineText(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", items: list.map(cleanTutorInlineText) });
    list = [];
  };
  const flushNumberedList = () => {
    if (!numberedList.length) return;
    blocks.push({ type: "numbered-list", items: numberedList.map(cleanTutorInlineText) });
    numberedList = [];
  };
  const flushTable = () => {
    if (tableRows.length < 2) {
      for (const row of tableRows) paragraph.push(row.join(" | "));
      tableRows = [];
      return;
    }
    const [headers, ...rows] = tableRows.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
    if (!headers || rows.length === 0) {
      tableRows = [];
      return;
    }
    blocks.push({
      type: "table",
      headers: headers.map(cleanTutorInlineText),
      rows: rows.map((row) => row.map(cleanTutorInlineText)),
    });
    tableRows = [];
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const table = parseMarkdownTableRow(line);
    if (heading) {
      flushTable();
      flushParagraph();
      flushList();
      flushNumberedList();
      blocks.push({ type: "heading", text: cleanTutorInlineText(heading[1]!.trim()) });
    } else if (table) {
      flushParagraph();
      flushList();
      flushNumberedList();
      tableRows.push(table);
    } else if (bullet) {
      flushTable();
      flushParagraph();
      flushNumberedList();
      list.push(bullet[1]!.trim());
    } else if (numbered) {
      flushTable();
      flushParagraph();
      flushList();
      numberedList.push(numbered[1]!.trim());
    } else {
      flushTable();
      flushList();
      flushNumberedList();
      paragraph.push(line);
    }
  }
  flushTable();
  flushParagraph();
  flushList();
  flushNumberedList();
  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

function repairTutorMarkdownLines(text: string): string[] {
  return text
    .replace(/(?<!\|)[ \t]*---[ \t]*(?!\|)/g, "\n\n")
    .replace(/[ \t]+(#{2,4}\s+)/g, "\n\n$1")
    .replace(/(#{2,4}\s+[^|\n]+?)\s+(\|)/g, "$1\n$2")
    .replace(/\|\s+\|/g, "|\n|")
    .replace(/(\|[-: ]+\|)\s+(\|)/g, "$1\n$2")
    .replace(/(\|[^|\n]+(?:\|[^|\n]+){1,}\|)\s+(?=\|)/g, "$1\n")
    .replace(/\|\s+(\|[-: ]+\|)/g, "|\n$1")
    .replace(/[ \t]+(\d+[.)]\s+\*\*)/g, "\n$1")
    .replace(/[ \t]+([-*]\s+\*\*)/g, "\n$1")
    .replace(/[ \t]+(\|[^|\n]+\|[^|\n]+\|)/g, "\n$1")
    .split("\n");
}

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  return cells.length >= 2 ? cells : null;
}

function cleanTutorInlineText(text: string): string {
  return text
    .replace(/\b(?:chk|clm|src|trace|cnc|artifact|turn|run)_[a-z0-9_]+\b/gi, "")
    .replace(/\(\s*(?:,\s*)+\)/g, "")
    .replace(/\(\s*(?:chunk|claim|source|trace)\s*\)/gi, "")
    .replace(/`+\s*`+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("$$")) {
      nodes.push(<TutorMath key={nodes.length} formula={token.slice(2, -2)} displayMode />);
    } else if (token.startsWith("$")) {
      nodes.push(<TutorMath key={nodes.length} formula={token.slice(1, -1)} displayMode={false} />);
    } else {
      const value = token.slice(1, -1).trim();
      if (value && !/^(?:chk|clm|src|trace|cnc|artifact|turn|run)_[a-z0-9_]+$/i.test(value)) {
        nodes.push(<code key={nodes.length}>{value}</code>);
      }
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function TutorMath({ formula, displayMode }: { formula: string; displayMode: boolean }) {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(normalizeTutorLatex(formula), {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
        output: "html",
      });
    } catch {
      return null;
    }
  }, [displayMode, formula]);
  if (!html) return <code>{formula}</code>;
  return (
    <span
      className={displayMode ? "tutor-math tutor-math-display" : "tutor-math"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function normalizeTutorLatex(value: string): string {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\text\{\s*W\/m\s*\}/g, "\\mathrm{W/m}")
    .trim();
}

function nearestPreviousUserMessageText(messages: UIMessage[], messageIndex: number): string | null {
  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      const text = messageText(messages[index]!).trim();
      return text || null;
    }
  }
  return null;
}

function messageText(message: UIMessage): string {
  const text = message.parts
    .map((part) => {
      if (part.type === "text") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return text;
}

function ReadableArtifactPayload({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([key, value]) => {
    if (["debug", "raw", "metadata"].includes(key)) return false;
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  });
  if (!entries.length) {
    return <div style={{ fontSize: 12, color: "#6b7280" }}>No readable fields recorded yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.slice(0, 8).map(([key, value]) => (
        <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>{key.replace(/_/g, " ")}</div>
          <ReadableValue value={value} />
        </div>
      ))}
    </div>
  );
}

function LearningArtifactOverview({ view }: { view: LearningArtifactView }) {
  return (
    <section style={{ border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel-strong)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 850, color: "var(--text-strong)" }}>{view.purpose}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>{view.studentAction}</div>
        </div>
        <span style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800, color: view.quality.needsReview ? "var(--warning)" : "var(--success)" }}>
          {view.quality.needsReview ? "needs review" : "ready"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 750 }}>
          {view.sourceRefs.length} evidence ref{view.sourceRefs.length === 1 ? "" : "s"}
        </span>
        {view.objectiveRefs.length > 0 && (
          <span style={{ background: "#ecfdf5", color: "#047857", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 750 }}>
            {view.objectiveRefs.length} objective ref{view.objectiveRefs.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {view.quality.issues.length > 0 && (
        <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 7, padding: 8, fontSize: 12, lineHeight: 1.45 }}>
          {view.quality.issues.join(" ")}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {view.sections.filter((section) => section.id !== "evidence").slice(0, 4).map((section) => (
          <div key={section.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 850, textTransform: "uppercase", marginBottom: 4 }}>{section.title}</div>
            <ReadableValue value={section.kind === "empty" ? section.emptyMessage ?? "No content yet." : section.content} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ReadableValue({ value }: { value: unknown }) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <div style={{ fontSize: 13, color: "#111827", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{String(value)}</div>;
  }
  if (Array.isArray(value)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {value.slice(0, 8).map((entry, index) => (
          <div key={index} style={{ fontSize: 12, color: "#374151", background: "#f9fafb", borderRadius: 6, padding: 8 }}>
            <ReadableValue value={entry} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const title = record.title ?? record.prompt ?? record.front ?? record.term ?? null;
    const body = record.body ?? record.answer ?? record.back ?? record.description ?? record.explanation ?? null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {title ? <div style={{ fontSize: 13, fontWeight: 750, color: "#111827" }}>{String(title)}</div> : null}
        {body ? <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>{String(body)}</div> : null}
        {!title && !body ? (
          Object.entries(record).slice(0, 6).map(([key, entry]) => (
            <div key={key} style={{ fontSize: 12, color: "#4b5563" }}>
              <strong>{key.replace(/_/g, " ")}:</strong> {typeof entry === "object" ? JSON.stringify(entry) : String(entry)}
            </div>
          ))
        ) : null}
      </div>
    );
  }
  return <div style={{ fontSize: 12, color: "#6b7280" }}>No data.</div>;
}

function toQuizQuestions(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.prompt !== "string") return [];
    return [
      {
        id: record.id,
        prompt: record.prompt,
        ...(typeof record.conceptId === "string" ? { conceptId: record.conceptId } : {}),
        ...(typeof record.referenceAnswer === "string" ? { referenceAnswer: record.referenceAnswer } : {}),
        ...(typeof record.explanation === "string" ? { explanation: record.explanation } : {}),
      },
    ];
  });
}

function toFlashcards(value: unknown): Flashcard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.front !== "string" || typeof record.back !== "string") return [];
    return [
      {
        id: record.id,
        front: record.front,
        back: record.back,
        ...(typeof record.conceptId === "string" ? { conceptId: record.conceptId } : {}),
      },
    ];
  });
}
