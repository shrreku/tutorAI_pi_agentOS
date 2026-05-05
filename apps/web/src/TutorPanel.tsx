import React, { useMemo, useRef, useState } from "react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import type { UIMessage } from "@tanstack/ai-client";

type ToolState = {
  toolCallId: string;
  toolName: string;
  status: "started" | "completed" | "failed";
};

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
    currentObjective: { id: string; title: string; status: string } | null;
    upcomingObjectives: Array<{ id: string; title: string; status: string }>;
    completedObjectives: Array<{ id: string; title: string; status: string }>;
    weakConcepts: Array<{ id: string; name: string }>;
  } | null;
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
  sourceNodeRefs: Array<{ refType: string; refId: string }>;
  sourceClaimIds: string[];
  sourceChunkIds: string[];
  createdAt: string;
  updatedAt: string;
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

interface TutorPanelProps {
  notebookId: string;
  selectedNodeRefs?: SelectedNodeRef[];
}

export default function TutorPanel({ notebookId, selectedNodeRefs = [] }: TutorPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"learn" | "practice" | "revise" | "explore" | "wiki_maintenance">("learn");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [toolStates, setToolStates] = useState<ToolState[]>([]);
  const [studyState, setStudyState] = useState<StudyState | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [settings, setSettings] = useState<NotebookSettings>({});
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactDetail | null>(null);
  const [artifactTitleDraft, setArtifactTitleDraft] = useState("");
  const [artifactMarkdownDraft, setArtifactMarkdownDraft] = useState("");
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [isArtifactLoading, setIsArtifactLoading] = useState(false);
  const [isArtifactSaving, setIsArtifactSaving] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardRevealed, setFlashcardRevealed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"active" | "paused" | "completed" | null>(null);
  const [isSessionLifecycleLoading, setIsSessionLifecycleLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use a ref so the factory always reads the latest refs without recreating the connection
  const selectedNodeRefsRef = useRef(selectedNodeRefs);
  React.useEffect(() => {
    selectedNodeRefsRef.current = selectedNodeRefs;
  }, [selectedNodeRefs]);

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
        setStudyState((await studyRes.json()) as StudyState);
      } else {
        setStudyState(null);
      }

      if (artifactsRes.ok) {
        const payload = (await artifactsRes.json()) as { artifacts: ArtifactSummary[] };
        setArtifacts(payload.artifacts ?? []);
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
  }, [notebookId]);

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
      if (chunk.type === "RUN_STARTED") {
        setRunStatus("running");
        setToolStates([]);
      } else if (chunk.type === "RUN_FINISHED") {
        tutorActionRef.current = "prompt";
        setRunStatus("completed");
        void loadSidebarData();
      } else if (chunk.type === "RUN_ERROR") {
        tutorActionRef.current = "prompt";
        setRunStatus("failed");
        void loadSidebarData();
      } else if (chunk.type === "TOOL_CALL_START") {
        if (chunk.toolCallId && chunk.toolName) {
          setToolStates((prev) => upsertToolState(prev, chunk.toolCallId!, chunk.toolName!, "started"));
        }
      } else if (chunk.type === "TOOL_CALL_END") {
        if (chunk.toolCallId && chunk.toolName) {
          setToolStates((prev) => upsertToolState(prev, chunk.toolCallId!, chunk.toolName!, "completed"));
        }
      }
    },
    onError() {
      setRunStatus("failed");
    },
  });

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  React.useEffect(() => {
    clear();
    setRunStatus("idle");
    setToolStates([]);
    setSessionId(null);
    setSessionStatus(null);
    closeArtifact();
    void loadSidebarData();
  }, [clear, loadSidebarData, notebookId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    tutorActionRef.current = isLoading ? "steer" : "prompt";
    setRunStatus("running");
    setToolStates([]);
    setInput("");
    
    // sendMessage will use the connection which includes sessionId and action if available
    await sendMessage(input);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 300, borderRight: "1px solid #ddd", position: "relative" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #eee", background: "#f9f9f9" }}>
        <strong>StudyAgent Tutor</strong>
        <div style={{ marginTop: 8, fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label>
            Mode:{" "}
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ marginLeft: 4 }}>
              <option value="learn">Learn</option>
              <option value="practice">Practice</option>
              <option value="revise">Revise</option>
              <option value="explore">Explore</option>
              <option value="wiki_maintenance">Wiki</option>
            </select>
          </label>
          {sessionId && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#6b7280" }}>
                {sessionStatus === "active" ? "🟢" : sessionStatus === "paused" ? "🟡" : sessionStatus === "completed" ? "⚫" : "○"} Session
              </span>
              {sessionStatus === "active" && (
                <>
                  <button
                    type="button"
                    onClick={() => void handlePauseSession()}
                    disabled={isSessionLifecycleLoading}
                    style={{ padding: "2px 6px", fontSize: 10, cursor: "pointer" }}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEndSession()}
                    disabled={isSessionLifecycleLoading}
                    style={{ padding: "2px 6px", fontSize: 10, cursor: "pointer", color: "#991b1b" }}
                  >
                    End
                  </button>
                </>
              )}
              {sessionStatus === "paused" && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleResumeSession()}
                    disabled={isSessionLifecycleLoading}
                    style={{ padding: "2px 6px", fontSize: 10, cursor: "pointer" }}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEndSession()}
                    disabled={isSessionLifecycleLoading}
                    style={{ padding: "2px 6px", fontSize: 10, cursor: "pointer", color: "#991b1b" }}
                  >
                    End
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {studyState && (studyState.studyPlan || studyState.curriculum || studyState.module || studyState.objectiveList || studyState.sessionPlan) && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: "#374151" }}>
              <strong>Current objective:</strong> {studyState.studyPlan?.currentObjective?.title ?? "No active objective"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
              {studyState.curriculum && (
                <span style={{ background: "#ffedd5", color: "#9a3412", padding: "2px 7px", borderRadius: 9999 }}>
                  Curriculum: {studyState.curriculum.title}
                </span>
              )}
              {studyState.module && (
                <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 7px", borderRadius: 9999 }}>
                  Module: {studyState.module.title}
                </span>
              )}
              {studyState.sessionPlan && (
                <span style={{ background: "#e0f2fe", color: "#075985", padding: "2px 7px", borderRadius: 9999 }}>
                  Session: {studyState.sessionPlan.title}
                </span>
              )}
              {studyState.objectiveList && (
                <span style={{ background: "#fef9c3", color: "#854d0e", padding: "2px 7px", borderRadius: 9999 }}>
                  Objective list: {studyState.objectiveList.objectiveIdsOrdered.length} topics
                </span>
              )}
              <span style={{ background: "#ede9fe", color: "#5b21b6", padding: "2px 7px", borderRadius: 9999 }}>
                {studyState.studyPlan?.completedObjectives.length ?? 0} completed
              </span>
              {(studyState.studyPlan?.upcomingObjectives ?? []).slice(0, 2).map((objective) => (
                <span key={objective.id} style={{ background: "#dbeafe", color: "#1d4ed8", padding: "2px 7px", borderRadius: 9999 }}>
                  Next: {objective.title}
                </span>
              ))}
            </div>
            {studyState.sessionPlan?.sessionGoal && (
              <div style={{ fontSize: 11, color: "#475569", background: "#f8fafc", padding: 6, borderRadius: 8 }}>
                <strong>Session goal:</strong> {studyState.sessionPlan.sessionGoal}
              </div>
            )}
            {studyState.studentProfile && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {studyState.studentProfile.goalSummary && (
                  <span style={{ background: "#f5f3ff", color: "#5b21b6", padding: "2px 7px", borderRadius: 9999, fontSize: 11 }}>
                    Goal: {studyState.studentProfile.goalSummary}
                  </span>
                )}
                {studyState.studentProfile.pacePreference && (
                  <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: 9999, fontSize: 11 }}>
                    Pace: {studyState.studentProfile.pacePreference}
                  </span>
                )}
                {studyState.studentProfile.depthPreference && (
                  <span style={{ background: "#e0f2fe", color: "#075985", padding: "2px 7px", borderRadius: 9999, fontSize: 11 }}>
                    Depth: {studyState.studentProfile.depthPreference}
                  </span>
                )}
              </div>
            )}
            {(studyState.studyPlan?.weakConcepts.length ?? 0) > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(studyState.studyPlan?.weakConcepts ?? []).slice(0, 4).map((concept) => (
                  <span key={concept.id} style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 7px", borderRadius: 9999, fontSize: 11 }}>
                    Weak: {concept.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedNodeRefs.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: "4px 8px",
              background: "#dbeafe",
              borderRadius: 4,
              fontSize: 11,
              color: "#1e40af",
            }}
          >
            Context: {selectedNodeRefs.length} node{selectedNodeRefs.length > 1 ? "s" : ""} selected —{" "}
            {selectedNodeRefs.map((r) => r.refType).join(", ")}
          </div>
        )}
        <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f9fafb" }}>
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

        {artifacts.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>RECENT ARTIFACTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflow: "auto" }}>
              {artifacts.slice(0, 5).map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => void openArtifact(artifact.id)}
                  style={{
                    textAlign: "left",
                    border: "1px solid #e5e7eb",
                    background: "white",
                    borderRadius: 6,
                    padding: "6px 8px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                    <strong style={{ color: "#111827" }}>{artifact.title}</strong>
                    <span style={{ color: "#6b7280" }}>{artifact.artifactType}</span>
                  </div>
                  {artifact.preview && (
                    <div style={{ marginTop: 3, fontSize: 11, color: "#4b5563", lineHeight: 1.4 }}>
                      {artifact.preview}
                      {artifact.preview.length >= 220 ? "…" : ""}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: 8,
              borderRadius: 6,
              background: msg.role === "user" ? "#dbeafe" : "#f0fdf4",
              textAlign: msg.role === "user" ? "right" : "left",
              fontSize: 13,
            }}
          >
            {renderMessage(msg)}
          </div>
        ))}
        {isLoading && (
          <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>Tutor is responding...</div>
        )}
        {runStatus !== "idle" && (
          <div style={{ fontSize: 12, color: runStatus === "failed" ? "#991b1b" : "#555" }}>
            Run status: {runStatus}
          </div>
        )}
        {toolStates.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {toolStates.map((tool) => (
              <div
                key={tool.toolCallId}
                style={{
                  fontSize: 12,
                  background: tool.status === "failed" ? "#fee2e2" : "#f3f4f6",
                  color: tool.status === "failed" ? "#991b1b" : "#374151",
                  padding: "4px 6px",
                  borderRadius: 4,
                }}
              >
                Tool {tool.toolName}: {tool.status}
              </div>
            ))}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", padding: 6, borderRadius: 4 }}>
            Error: {error.message}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: 12, borderTop: "1px solid #eee", display: "flex", gap: 6, flexDirection: "column" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the tutor... (Ctrl+Enter to send)"
          style={{
            flex: 1,
            minHeight: 60,
            padding: 8,
            borderRadius: 4,
            border: "1px solid #ddd",
            fontFamily: "system-ui",
            fontSize: 13,
            resize: "none",
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim()}          style={{
            padding: "8px 12px",
            background: isLoading ? "#7c3aed" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
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
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>ARTIFACT PAYLOAD</div>
                <pre style={{ margin: 0, padding: 10, background: "#f9fafb", borderRadius: 6, fontSize: 11, overflow: "auto" }}>
                  {JSON.stringify(selectedArtifact.payload, null, 2)}
                </pre>
              </>
            )}
            {quizFeedback && (
              <div style={{ fontSize: 12, color: "#1f2937", background: "#f3f4f6", padding: 8, borderRadius: 6 }}>{quizFeedback}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function renderMessage(message: UIMessage): React.ReactNode {
  const text = message.parts
    .map((part) => {
      if (part.type === "text") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return text || null;
}

function upsertToolState(
  items: ToolState[],
  toolCallId: string,
  toolName: string,
  status: ToolState["status"],
): ToolState[] {
  const idx = items.findIndex((item) => item.toolCallId === toolCallId);
  if (idx === -1) {
    return [...items, { toolCallId, toolName, status }];
  }

  return items.map((item, index) => (index === idx ? { ...item, toolName, status } : item));
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
