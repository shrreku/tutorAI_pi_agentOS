import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import katex from "katex";
import type { GraphCanvasNode, ReferenceBlock, ReferenceSurface } from "@studyagent/schemas";
import { learnerFacingSurfaceStatus } from "@studyagent/schemas";

type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answer: string | null;
  referenceAnswer: string | null;
  explanation: string | null;
  difficulty: string | null;
  conceptIds: string[];
};

type QuizAttempt = {
  answer: string;
  isCorrect: boolean;
};

type SavedQuizAttempt = QuizAttempt & {
  id: string;
  questionId: string;
  score: number | null;
  conceptIds: string[];
  createdAt: string;
};

interface FullPanelViewerProps {
  notebookId: string;
  node: GraphCanvasNode;
  onClose: () => void;
  onLaunchTutor?: (node: GraphCanvasNode) => void;
  onShowProvenance?: (node: GraphCanvasNode) => void;
  onDraftTutorPrompt?: (prompt: string, node: GraphCanvasNode) => void;
}

export const FullPanelViewer: React.FC<FullPanelViewerProps> = ({ notebookId, node, onClose, onLaunchTutor, onShowProvenance, onDraftTutorPrompt }) => {
  if (!node) return null;
  const [regenInstruction, setRegenInstruction] = React.useState("");
  const [showRegenOptions, setShowRegenOptions] = React.useState(false);
  const [quizIndexBySurface, setQuizIndexBySurface] = React.useState<Record<string, number>>({});
  const [quizAnswersBySurface, setQuizAnswersBySurface] = React.useState<Record<string, Record<string, QuizAttempt>>>({});
  const [selectedQuizAnswers, setSelectedQuizAnswers] = React.useState<Record<string, string>>({});
  const sourceNodeId =
    node.nodeType === "weak_concept" && typeof node.properties.conceptId === "string"
      ? node.properties.conceptId
      : node.id;

  const { data: referenceSurface, isLoading: isReferenceSurfaceLoading, isError: isReferenceSurfaceError } = useQuery({
    queryKey: ["reference-surface", notebookId, sourceNodeId],
    queryFn: async (): Promise<ReferenceSurface> => {
      const response = await fetch(`/api/v1/notebooks/${notebookId}/nodes/${sourceNodeId}/reference-surface`);
      if (!response.ok) {
        throw new Error(`Failed to load reference surface (${response.status})`);
      }
      return (await response.json()) as ReferenceSurface;
    },
  });
  const queryClient = useQueryClient();

  const title =
    (typeof node.properties.title === "string" ? node.properties.title : null) ??
    (typeof node.properties.canonicalName === "string" ? node.properties.canonicalName : null) ??
    (typeof node.properties.canonical_name === "string" ? node.properties.canonical_name : null) ??
    node.id.slice(0, 12);
  const regeneratePrompt = referenceSurface ? buildRegenerationPrompt(referenceSurface) : null;
  const sourceFileUrl =
    referenceSurface?.surfaceType === "source"
      ? `/api/v1/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(referenceSurface.nodeRef.refId)}/file`
      : null;
  const sourceExtractedUrl =
    referenceSurface?.surfaceType === "source"
      ? `/api/v1/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(referenceSurface.nodeRef.refId)}/extracted`
      : null;
  const isQuizArtifact =
    referenceSurface?.surfaceType === "artifact" &&
    node.nodeType === "artifact" &&
    (node.properties.artifactType === "quiz" || node.properties.artifact_type === "quiz");
  const { data: savedQuizAttempts } = useQuery({
    queryKey: ["quiz-attempts", notebookId, sourceNodeId],
    enabled: Boolean(isQuizArtifact),
    queryFn: async (): Promise<SavedQuizAttempt[]> => {
      const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(sourceNodeId)}/quiz-attempts`);
      if (!response.ok) {
        throw new Error(`Failed to load quiz attempts (${response.status})`);
      }
      const payload = (await response.json()) as { attempts?: SavedQuizAttempt[] };
      return Array.isArray(payload.attempts) ? payload.attempts : [];
    },
  });
  const savedQuizAttemptsByQuestion = React.useMemo(() => {
    const byQuestion: Record<string, QuizAttempt> = {};
    for (const attempt of savedQuizAttempts ?? []) {
      if (byQuestion[attempt.questionId]) continue;
      byQuestion[attempt.questionId] = { answer: attempt.answer, isCorrect: attempt.isCorrect };
    }
    return byQuestion;
  }, [savedQuizAttempts]);
  const regenerate = useMutation({
    mutationFn: async (instructionOverride?: string) => {
      const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/nodes/${encodeURIComponent(sourceNodeId)}/regenerate-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: referenceSurface?.surfaceType ?? node.nodeType,
          instruction: instructionOverride?.trim() || regenInstruction.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to regenerate reference (${response.status})`);
      }
      return response.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId, sourceNodeId] }),
        queryClient.invalidateQueries({ queryKey: ["curriculum-outline", notebookId] }),
        queryClient.invalidateQueries({ queryKey: ["notebook-graph", notebookId] }),
      ]);
    },
  });
  const requestRegeneration = () => {
    if (!regeneratePrompt) return;
    regenerate.mutate(undefined);
  };
  const extendQuiz = (surfaceTitle: string) => {
    setShowRegenOptions(true);
    const instruction = `Extend "${surfaceTitle}" with 3 additional source-grounded questions. Keep the existing useful questions, add harder application and misconception checks, include choices, correct answers, explanations, and conceptIds where possible.`;
    setRegenInstruction(instruction);
    regenerate.mutate(instruction);
  };
  const submitQuizAttempt = async (surfaceId: string, question: QuizQuestion, answer: string) => {
    const expected = correctAnswerText(question);
    const isCorrect = normalizeAnswer(answer) === normalizeAnswer(expected);
    setQuizAnswersBySurface((current) => ({
      ...current,
      [surfaceId]: {
        ...(current[surfaceId] ?? {}),
        [question.id]: { answer, isCorrect },
      },
    }));
    try {
      const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/artifacts/${encodeURIComponent(sourceNodeId)}/quiz-attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          answer,
          isCorrect,
          score: isCorrect ? 1 : 0,
          conceptIds: question.conceptIds,
          explanation: question.explanation ?? question.referenceAnswer ?? undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to save quiz attempt (${response.status})`);
      }
      await queryClient.invalidateQueries({ queryKey: ["quiz-attempts", notebookId, sourceNodeId] });
      await queryClient.invalidateQueries({ queryKey: ["notebook-graph", notebookId] });
    } catch (error) {
      console.error(error);
    }
  };
  const renderMarkdownBlock = (text: string) => <LearnerMarkdown text={text} />;
  const renderList = (items: unknown, empty: string, variant: "default" | "quiz" | "flashcard" = "default") => {
    if (!Array.isArray(items) || items.length === 0) return <div style={{ color: "#6b7280" }}>{empty}</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, index) => {
          const record = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          const itemTitle = String(record.title ?? record.front ?? record.prompt ?? record.problem ?? record.term ?? item);
          const body = record.body ?? record.back ?? record.answer ?? record.referenceAnswer ?? record.explanation ?? record.description;
          const options = Array.isArray(record.options) ? record.options : Array.isArray(record.choices) ? record.choices : [];
          return (
            <div key={`${itemTitle}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: variant === "default" ? 10 : 14, background: "#fff" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {variant !== "default" && (
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: variant === "quiz" ? "#eff6ff" : "#f0fdf4", color: variant === "quiz" ? "#1d4ed8" : "#15803d", display: "grid", placeItems: "center", flex: "0 0 auto", fontSize: 12, fontWeight: 800 }}>
                    {index + 1}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 750, color: "#111827" }}>{itemTitle}</div>
                  {options.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6, marginTop: 8 }}>
                      {options.map((option, optionIndex) => (
                        <div key={optionIndex} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", color: "#374151", background: "#f9fafb" }}>
                          {String(option)}
                        </div>
                      ))}
                    </div>
                  )}
                  {body ? <div style={{ marginTop: 8, color: "#4b5563" }}>{String(body)}</div> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  const renderBlock = (block: ReferenceBlock) => {
    if (block.kind === "markdown" && typeof block.content === "string") {
      return renderMarkdownBlock(block.content);
    }
    if (block.kind === "summary" || block.kind === "definition") {
      return <div style={{ whiteSpace: "pre-wrap" }}>{String(block.content ?? "")}</div>;
    }
    if (block.kind === "formula_table" || block.kind === "comparison_table") {
      return <StructuredTable value={block.content} />;
    }
    if (block.kind === "citation_list") {
      return <CitationList value={block.content} />;
    }
    if (block.kind === "question_list") {
      return (
        <QuizPractice
          surfaceId={referenceSurface?.id ?? sourceNodeId}
          title={referenceSurface?.title ?? title}
          questions={normalizeQuizQuestions(block.content)}
          activeIndex={quizIndexBySurface[referenceSurface?.id ?? sourceNodeId] ?? 0}
          attempts={{
            ...savedQuizAttemptsByQuestion,
            ...(quizAnswersBySurface[referenceSurface?.id ?? sourceNodeId] ?? {}),
          }}
          selectedAnswers={selectedQuizAnswers}
          isExtending={regenerate.isPending}
          onSelectAnswer={(questionId, answer) => setSelectedQuizAnswers((current) => ({ ...current, [questionId]: answer }))}
          onSubmit={(question, answer) => void submitQuizAttempt(referenceSurface?.id ?? sourceNodeId, question, answer)}
          onMove={(index) => setQuizIndexBySurface((current) => ({ ...current, [referenceSurface?.id ?? sourceNodeId]: index }))}
          onExtend={() => extendQuiz(referenceSurface?.title ?? title)}
          {...(onLaunchTutor ? { onLaunchTutor: () => onLaunchTutor(node) } : {})}
        />
      );
    }
    if (block.kind === "flashcard_list") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {renderList(block.content, "No entries recorded.", "flashcard")}
          {onLaunchTutor && (
            <button
              type="button"
              onClick={() => onLaunchTutor(node)}
              style={{ alignSelf: "flex-start", padding: "6px 10px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}
            >
              Review in tutor chat
            </button>
          )}
        </div>
      );
    }
    if (block.kind === "step_list") {
      return renderList(block.content, "No entries recorded.");
    }
    return <StructuredValue value={block.content} />;
  };
  const renderReferenceSurface = (surface: ReferenceSurface) => {
    if (surface.surfaceType === "source") {
      return <SourceDocumentViewer notebookId={notebookId} sourceId={surface.nodeRef.refId} title={surface.title} />;
    }
    return (
    <div style={{ maxWidth: 920, margin: "0 auto", color: "#111827", lineHeight: 1.55, fontSize: 14 }}>
      <main style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
              <span style={{ borderRadius: 999, background: surface.surfaceType === "artifact" ? "#fff7ed" : "#eff6ff", color: surface.surfaceType === "artifact" ? "#9a3412" : "#1d4ed8", padding: "2px 8px", fontSize: 11, fontWeight: 800, textTransform: "capitalize", flex: "0 0 auto" }}>
                {surface.surfaceType.replace(/_/g, " ")}
              </span>
              {surface.generation && <GenerationBadge generation={surface.generation} />}
              <div style={{ fontSize: 22, fontWeight: 850, letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{surface.title}</div>
            </div>
            {(() => {
              const label = learnerFacingSurfaceStatus({
                surfaceType: surface.surfaceType,
                status: surface.status,
                quality: surface.quality,
              })?.replace(/_/g, " ");
              return label ? <span style={{ color: "#6b7280", fontSize: 12 }}>{label}</span> : null;
            })()}
          </div>
          {regeneratePrompt && (
            <RegenerateControls
              isPending={regenerate.isPending}
              instruction={regenInstruction}
              showOptions={showRegenOptions}
              onInstructionChange={setRegenInstruction}
              onToggleOptions={() => setShowRegenOptions((value) => !value)}
              onRegenerate={requestRegeneration}
              errorMessage={regenerate.error instanceof Error ? regenerate.error.message : null}
            />
          )}
        </div>
        {surface.summary && !isQuizArtifactSurface(surface, node) && <ReferenceSection title="Summary">{surface.summary}</ReferenceSection>}
        {visibleReferenceBlocks(surface, node).length > 0 ? (
          visibleReferenceBlocks(surface, node).map((block) => (
            <ReferenceSection key={block.id} title={block.title ?? block.kind.replace(/_/g, " ")}>
              {renderBlock(block)}
            </ReferenceSection>
          ))
        ) : (
          <ReferenceSection title="Reference">
            <div style={{ color: "#6b7280" }}>No durable reference content has been generated for this node yet.</div>
          </ReferenceSection>
        )}
      </main>
    </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "white" }}>
      <div
        style={{
          minHeight: 36,
          padding: "5px 10px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "#f9fafb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button
            onClick={onClose}
            title="Return to workspace"
            style={{
              background: "none",
              border: "1px solid #d1d5db",
              borderRadius: 5,
              padding: "2px 7px",
              cursor: "pointer",
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 700,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, fontWeight: 750, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
          {sourceFileUrl && sourceExtractedUrl && (
            <>
              <a href={sourceFileUrl} target="_blank" rel="noreferrer" style={{ padding: "3px 8px", color: "#1d4ed8", border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 5, fontSize: 11, fontWeight: 800, lineHeight: 1.4, textDecoration: "none" }}>
                Open original
              </a>
              <a href={sourceExtractedUrl} target="_blank" rel="noreferrer" style={{ padding: "3px 8px", color: "#374151", border: "1px solid #d1d5db", background: "#f3f4f6", borderRadius: 5, fontSize: 11, fontWeight: 800, lineHeight: 1.4, textDecoration: "none" }}>
                Extracted text
              </a>
            </>
          )}
          {onLaunchTutor && (
            <button
              onClick={() => onLaunchTutor(node)}
              style={{ padding: "3px 8px", background: "#2563eb", color: "#fff", border: "1px solid #2563eb", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 800, lineHeight: 1.4 }}
            >
              Teach me
            </button>
          )}
          {onShowProvenance && (
            <button
              onClick={() => onShowProvenance(node)}
              style={{ padding: "3px 8px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 750, lineHeight: 1.4 }}
            >
              Evidence
            </button>
          )}
          {regeneratePrompt && referenceSurface?.surfaceType !== "source" && (
            <button
              disabled={regenerate.isPending}
              onClick={() => setShowRegenOptions((value) => !value)}
              style={{ padding: "3px 8px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 5, cursor: regenerate.isPending ? "wait" : "pointer", fontSize: 11, fontWeight: 800, lineHeight: 1.4, opacity: regenerate.isPending ? 0.7 : 1 }}
            >
              Regenerate
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: referenceSurface?.surfaceType === "source" ? 0 : 16 }}>
        {referenceSurface ? (
          renderReferenceSurface(referenceSurface)
        ) : isReferenceSurfaceLoading ? (
          <ReferenceSurfaceState title={title} message="Loading reference surface." />
        ) : isReferenceSurfaceError ? (
          <ReferenceSurfaceState title={title} message="Reference surface is unavailable right now." />
        ) : (
          <ReferenceSurfaceState title={title} message="No durable reference content has been generated for this node yet." />
        )}
      </div>

      <div style={{ padding: referenceSurface ? 0 : 12, borderTop: referenceSurface ? "none" : "1px solid #e5e7eb", display: "flex", gap: 8 }}>
        {!referenceSurface && onLaunchTutor && (
          <button
            onClick={() => onLaunchTutor(node)}
            style={{ flex: 1, padding: "8px 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Teach this
          </button>
        )}
      </div>
    </div>
  );
};

function ReferenceSurfaceState({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", color: "#111827", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "#6b7280" }}>{message}</div>
    </div>
  );
}

function GenerationBadge({ generation }: { generation: NonNullable<ReferenceSurface["generation"]> }) {
  const isAi = generation.mode === "ai";
  return (
    <span
      title={`${generation.label} generated${generation.generatedAt ? ` at ${generation.generatedAt}` : ""}`}
      style={{
        borderRadius: 999,
        background: isAi ? "#ecfeff" : "#f8fafc",
        color: isAi ? "#0e7490" : "#64748b",
        border: `1px solid ${isAi ? "#a5f3fc" : "#e2e8f0"}`,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: 0,
        flex: "0 0 auto",
      }}
    >
      {generation.label}
    </span>
  );
}

function ReferenceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 850, color: "#64748b", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0 }}>{title}</div>
      <div>{children}</div>
    </section>
  );
}

export default FullPanelViewer;

function isQuizArtifactSurface(surface: ReferenceSurface, node: GraphCanvasNode): boolean {
  return (
    surface.surfaceType === "artifact" &&
    node.nodeType === "artifact" &&
    (node.properties.artifactType === "quiz" || node.properties.artifact_type === "quiz")
  );
}

function visibleReferenceBlocks(surface: ReferenceSurface, node: GraphCanvasNode): ReferenceBlock[] {
  if (!isQuizArtifactSurface(surface, node)) return surface.blocks;
  return surface.blocks.filter((block) => {
    if (block.id === "overview") return false;
    if (block.kind === "markdown" && block.title?.toLowerCase() === "practice goal") return false;
    return true;
  });
}

function RegenerateControls({
  isPending,
  instruction,
  showOptions,
  errorMessage,
  onInstructionChange,
  onToggleOptions,
  onRegenerate,
}: {
  isPending: boolean;
  instruction: string;
  showOptions: boolean;
  errorMessage: string | null;
  onInstructionChange: (value: string) => void;
  onToggleOptions: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={isPending}
          onClick={onRegenerate}
          style={{ padding: "5px 10px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, fontWeight: 850, cursor: isPending ? "wait" : "pointer", fontSize: 12, opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Regenerating..." : "Regenerate with LLM"}
        </button>
        <button
          type="button"
          onClick={onToggleOptions}
          style={{ padding: "5px 10px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", borderRadius: 6, fontWeight: 800, cursor: "pointer", fontSize: 12 }}
        >
          {showOptions ? "Hide instructions" : "Add instruction"}
        </button>
      </div>
      {showOptions && (
        <textarea
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="Optional: make it more visual, add harder examples, focus on exam prep, include formulas..."
          style={{ width: "100%", minHeight: 58, resize: "vertical", border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, font: "inherit", fontSize: 13, lineHeight: 1.4 }}
        />
      )}
      {errorMessage && <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 750 }}>{errorMessage}</div>}
    </div>
  );
}

function QuizPractice({
  surfaceId,
  title,
  questions,
  activeIndex,
  attempts,
  selectedAnswers,
  isExtending,
  onSelectAnswer,
  onSubmit,
  onMove,
  onExtend,
  onLaunchTutor,
}: {
  surfaceId: string;
  title: string;
  questions: QuizQuestion[];
  activeIndex: number;
  attempts: Record<string, QuizAttempt>;
  selectedAnswers: Record<string, string>;
  isExtending: boolean;
  onSelectAnswer: (questionId: string, answer: string) => void;
  onSubmit: (question: QuizQuestion, answer: string) => void;
  onMove: (index: number) => void;
  onExtend: () => void;
  onLaunchTutor?: () => void;
}) {
  if (questions.length === 0) {
    return <div style={{ color: "#6b7280" }}>No quiz questions have been generated yet.</div>;
  }

  const boundedIndex = Math.min(Math.max(activeIndex, 0), questions.length - 1);
  const active = questions[boundedIndex]!;
  const attempt = attempts[active.id] ?? null;
  const selected = selectedAnswers[active.id] ?? "";
  const attemptedCount = Object.keys(attempts).filter((id) => questions.some((question) => question.id === id)).length;
  const correctCount = questions.filter((question) => attempts[question.id]?.isCorrect).length;
  const scorePct = attemptedCount > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  const isComplete = attemptedCount === questions.length;
  const reviewPoints = questions.filter((question) => attempts[question.id]?.isCorrect === false);
  const correctAnswer = correctAnswerText(active);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 850, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "2px 8px" }}>
            {boundedIndex + 1} / {questions.length}
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            {attemptedCount} attempted
          </span>
          {attemptedCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 850, color: scorePct >= 70 ? "#166534" : "#9a3412", background: scorePct >= 70 ? "#f0fdf4" : "#fff7ed", border: `1px solid ${scorePct >= 70 ? "#bbf7d0" : "#fed7aa"}`, borderRadius: 999, padding: "2px 8px" }}>
              Score {correctCount}/{questions.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {onLaunchTutor && (
            <button type="button" onClick={onLaunchTutor} style={smallButtonStyle("#f8fafc", "#334155", "#cbd5e1")}>
              Review with tutor
            </button>
          )}
          <button type="button" disabled={isExtending} onClick={onExtend} style={smallButtonStyle("#eff6ff", "#1d4ed8", "#bfdbfe", isExtending)}>
            {isExtending ? "Extending..." : "Extend with LLM"}
          </button>
        </div>
      </div>

      {isComplete && (
        <div style={{ border: "1px solid #dbeafe", borderRadius: 8, background: "#f8fafc", padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 850, color: "#0f172a" }}>{title} score: {correctCount}/{questions.length}</div>
          {reviewPoints.length > 0 ? (
            <div style={{ color: "#334155", lineHeight: 1.5 }}>
              Review: {reviewPoints.map((question) => question.prompt).join("; ")}
            </div>
          ) : (
            <div style={{ color: "#166534", fontWeight: 750 }}>All questions are correct. Extend the quiz for a harder check.</div>
          )}
        </div>
      )}

      <article style={{ border: "1px solid #dbe3ef", borderRadius: 10, background: "#fff", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, color: "#64748b", fontSize: 12, fontWeight: 800 }}>
          <span>Question {boundedIndex + 1}</span>
          {active.difficulty && <span style={{ borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", padding: "1px 7px" }}>{active.difficulty}</span>}
        </div>
        <div style={{ fontSize: 20, lineHeight: 1.35, fontWeight: 850, color: "#0f172a", marginBottom: 14 }}>
          {inlineMarkdown(active.prompt)}
        </div>

        {active.choices.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
            {active.choices.map((choice, index) => {
              const value = choice;
              const isSelected = selected === value || attempt?.answer === value;
              const isCorrectChoice = attempt ? isAnswerMatch(value, correctAnswer) : false;
              const isWrongChoice = Boolean(attempt && isSelected && !attempt.isCorrect);
              return (
                <button
                  key={`${surfaceId}-${active.id}-${index}`}
                  type="button"
                  disabled={Boolean(attempt)}
                  onClick={() => onSelectAnswer(active.id, value)}
                  style={{
                    textAlign: "left",
                    minHeight: 64,
                    border: `1px solid ${isCorrectChoice ? "#86efac" : isWrongChoice ? "#fca5a5" : isSelected ? "#93c5fd" : "#dbe3ef"}`,
                    background: isCorrectChoice ? "#f0fdf4" : isWrongChoice ? "#fef2f2" : isSelected ? "#eff6ff" : "#f8fafc",
                    color: "#1f2937",
                    borderRadius: 8,
                    padding: "10px 12px",
                    font: "inherit",
                    lineHeight: 1.35,
                    cursor: attempt ? "default" : "pointer",
                  }}
                >
                  <span style={{ fontWeight: 850, color: "#64748b", marginRight: 8 }}>{String.fromCharCode(65 + index)}.</span>
                  {inlineMarkdown(choice)}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            value={selected}
            disabled={Boolean(attempt)}
            onChange={(event) => onSelectAnswer(active.id, event.target.value)}
            placeholder="Type your answer..."
            style={{ width: "100%", minHeight: 92, border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, font: "inherit", resize: "vertical" }}
          />
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={boundedIndex === 0} onClick={() => onMove(boundedIndex - 1)} style={smallButtonStyle("#fff", "#334155", "#cbd5e1", boundedIndex === 0)}>
              Previous
            </button>
            <button type="button" disabled={boundedIndex === questions.length - 1} onClick={() => onMove(boundedIndex + 1)} style={smallButtonStyle("#fff", "#334155", "#cbd5e1", boundedIndex === questions.length - 1)}>
              Next
            </button>
          </div>
          {!attempt && (
            <button
              type="button"
              disabled={!selected.trim()}
              onClick={() => onSubmit(active, selected)}
              style={smallButtonStyle("#2563eb", "#f8fafc", "#2563eb", !selected.trim())}
            >
              Submit answer
            </button>
          )}
        </div>

        {attempt && (
          <div style={{ marginTop: 14, border: `1px solid ${attempt.isCorrect ? "#bbf7d0" : "#fed7aa"}`, background: attempt.isCorrect ? "#f0fdf4" : "#fff7ed", borderRadius: 8, padding: 12, color: "#1f2937", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 850, color: attempt.isCorrect ? "#166534" : "#9a3412", marginBottom: 4 }}>
              {attempt.isCorrect ? "Correct" : "Needs review"}
            </div>
            <div><strong>Answer:</strong> {inlineMarkdown(correctAnswer || "No answer key recorded.")}</div>
            {active.explanation && <div style={{ marginTop: 6 }}><strong>Why:</strong> {inlineMarkdown(active.explanation)}</div>}
          </div>
        )}
      </article>
    </div>
  );
}

function smallButtonStyle(background: string, color: string, border: string, disabled = false): React.CSSProperties {
  return {
    padding: "6px 10px",
    border: `1px solid ${border}`,
    background,
    color,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 850,
    lineHeight: 1.3,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

function normalizeQuizQuestions(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): QuizQuestion | null => {
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const choices = Array.isArray(record.choices)
        ? record.choices.map((choice) => String(choice)).filter(Boolean)
        : Array.isArray(record.options)
          ? record.options.map((choice) => String(choice)).filter(Boolean)
          : [];
      const rawPrompt = stringValue(record.prompt ?? record.question ?? record.title ?? record.problem);
      const prompt = rawPrompt ? stripEmbeddedChoices(rawPrompt, choices) : null;
      if (!prompt) return null;
      const conceptIds = Array.isArray(record.conceptIds)
        ? record.conceptIds.filter((id): id is string => typeof id === "string")
        : typeof record.conceptId === "string"
          ? [record.conceptId]
          : [];
      return {
        id: stringValue(record.id ?? record.questionId) ?? `q_${index + 1}`,
        prompt,
        choices,
        answer: stringValue(record.answer),
        referenceAnswer: stringValue(record.referenceAnswer),
        explanation: stringValue(record.explanation),
        difficulty: stringValue(record.difficulty),
        conceptIds,
      };
    })
    .filter((question): question is QuizQuestion => Boolean(question));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stripEmbeddedChoices(prompt: string, choices: string[]): string {
  if (choices.length === 0) return prompt;
  const byLetter = prompt.match(/\s+a[).]\s+/i);
  if (byLetter?.index && byLetter.index > 0) {
    return prompt.slice(0, byLetter.index).trim();
  }
  const firstChoice = choices[0]?.trim();
  if (firstChoice) {
    const firstChoiceIndex = prompt.toLowerCase().indexOf(firstChoice.toLowerCase());
    if (firstChoiceIndex > 0) {
      return prompt.slice(0, firstChoiceIndex).replace(/\s*[a-d][).]?\s*$/i, "").trim();
    }
  }
  return prompt;
}

function normalizeAnswer(value: string): string {
  return value.toLowerCase().replace(/^[a-d][.)]\s*/i, "").replace(/\s+/g, " ").trim();
}

function isAnswerMatch(candidate: string, expected: string): boolean {
  const normalizedCandidate = normalizeAnswer(candidate);
  const normalizedExpected = normalizeAnswer(expected);
  if (!normalizedCandidate || !normalizedExpected) return false;
  return normalizedCandidate === normalizedExpected || normalizedCandidate.startsWith(normalizedExpected) || normalizedExpected.startsWith(normalizedCandidate);
}

function correctAnswerText(question: QuizQuestion): string {
  const raw = question.answer ?? question.referenceAnswer ?? "";
  const letter = raw.trim().match(/^([a-d])(?:[.)])?$/i)?.[1]?.toLowerCase();
  if (letter && question.choices.length > 0) {
    const index = letter.charCodeAt(0) - "a".charCodeAt(0);
    return question.choices[index] ?? raw;
  }
  return raw;
}

function SourceDocumentViewer({ notebookId, sourceId, title }: { notebookId: string; sourceId: string; title: string }) {
  const fileUrl = `/api/v1/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}/file`;
  return (
    <section style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#26384c" }}>
      <iframe
        title={`Original source: ${title}`}
        src={fileUrl}
        style={{ display: "block", width: "100%", flex: 1, minHeight: 0, border: 0, background: "#26384c" }}
      />
    </section>
  );
}

function buildRegenerationPrompt(surface: ReferenceSurface): string | null {
  const title = surface.title;
  const ref = `${surface.nodeRef.refType}:${surface.nodeRef.refId}`;
  if (surface.surfaceType === "artifact") {
    return [
      `Regenerate the selected artifact "${title}" using the LLM again.`,
      `Keep it source-grounded and update or replace the artifact connected to ${ref}.`,
      "Use the correct artifact format for its type: flashcards as cards, quizzes as questions, formula sheets with LaTeX, comparisons as tables, worked examples as steps.",
      "Make the content useful enough for a student to study from directly, not a placeholder.",
    ].join("\n");
  }
  if (surface.surfaceType === "concept" || surface.surfaceType === "wiki_page") {
    return [
      `Regenerate the selected ${surface.surfaceType === "concept" ? "concept wiki page" : "wiki page"} "${title}" using the LLM again.`,
      `Use ${ref} as the target page.`,
      "Format it as a strong study page: definition, intuition, formal details with LaTeX where useful, worked example, common confusions, quick self-check, and citations from source evidence.",
      "Prefer precise source-backed claims and explicitly mark anything that still needs evidence.",
    ].join("\n");
  }
  if (surface.surfaceType === "module" || surface.surfaceType === "curriculum" || surface.surfaceType === "objective" || surface.surfaceType === "objective_list" || surface.surfaceType === "session") {
    return [
      `Regenerate the selected ${surface.surfaceType} page "${title}" using the LLM again.`,
      `Use ${ref} as the target planning surface.`,
      "Format it for faster learning using the specific page type: curriculum path, module lesson, objective mastery page, objective sequence, or session plan. Use markdown tables and LaTeX formulas when useful.",
      "Keep it grounded in uploaded sources and the learner's current mastery state.",
    ].join("\n");
  }
  return null;
}

function CitationList({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return <div style={{ color: "#6b7280" }}>No citations recorded.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, index) => {
        const record = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
        const label = record.label ?? record.title ?? record.sourceTitle ?? record.refId ?? row;
        const locator = record.locator ?? record.page ?? record.section ?? record.chunkId;
        return (
          <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
            <div style={{ fontWeight: 750, color: "#111827" }}>{String(label)}</div>
            {locator ? <div style={{ marginTop: 3, color: "#6b7280", fontSize: 13 }}>{String(locator)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function StructuredTable({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return <div style={{ color: "#6b7280" }}>No rows recorded.</div>;
  const records = rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row));
  if (records.length === 0) return <StructuredValue value={rows} />;
  const headers = Array.from(new Set(records.flatMap((row) => Object.keys(row)))).slice(0, 8);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 8px", color: "#6b7280" }}>
                {header.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row, index) => (
            <tr key={index}>
              {headers.map((header) => (
                <td key={header} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 8px", verticalAlign: "top" }}>
                  {String(row[header] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnerMarkdown({ text }: { text: string }) {
  const blocks = markdownBlocks(text);
  return (
    <div style={{ lineHeight: 1.65, color: "#10233d" }}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const size = block.level === 1 ? 26 : block.level === 2 ? 19 : 16;
          return (
            <div key={index} style={{ fontSize: size, fontWeight: 850, margin: index === 0 ? "0 0 10px" : "22px 0 8px", lineHeight: 1.25, color: "#0f2541" }}>
              {inlineMarkdown(block.text)}
            </div>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} style={{ margin: "10px 0", padding: "8px 12px", border: "1px solid #c7d2fe", borderRadius: 8, background: "#eef2ff", color: "#27346b", fontWeight: 650 }}>
              {inlineMarkdown(block.text)}
            </blockquote>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} style={{ margin: "8px 0 12px", paddingLeft: 22 }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ margin: "4px 0" }}>{inlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ordered_list") {
          return (
            <ol key={index} style={{ margin: "8px 0 12px", paddingLeft: 22 }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ margin: "4px 0" }}>{inlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "display_math") {
          return <FormulaBlock key={index} formula={block.text} />;
        }
        if (block.type === "table") {
          return <MarkdownTable key={index} rows={block.rows} />;
        }
        return (
          <p key={index} style={{ margin: "8px 0", maxWidth: "75ch" }}>
            {inlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "ordered_list"; items: string[] }
  | { type: "display_math"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

function markdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let orderedList: string[] = [];
  let table: string[][] = [];
  let math: string[] | null = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };
  const flushOrderedList = () => {
    if (!orderedList.length) return;
    blocks.push({ type: "ordered_list", items: orderedList });
    orderedList = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    if (rows.length) blocks.push({ type: "table", rows });
    table = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (math) {
      if (line.endsWith("$$")) {
        const close = line.slice(0, -2).trim();
        if (close) math.push(close);
        blocks.push({ type: "display_math", text: math.join("\n") });
        math = null;
      } else {
        math.push(rawLine);
      }
      continue;
    }
    if (!line) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushTable();
      continue;
    }
    if (line.startsWith("$$")) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushTable();
      const rest = line.slice(2).trim();
      if (rest.endsWith("$$") && rest.length > 2) {
        blocks.push({ type: "display_math", text: rest.slice(0, -2).trim() });
      } else {
        math = rest ? [rest] : [];
      }
      continue;
    }
    if (isMarkdownTableLine(line)) {
      flushParagraph();
      flushList();
      flushOrderedList();
      table.push(line.split("|").map((cell) => cell.trim()).filter((cell, index, cells) => cell || index > 0 && index < cells.length - 1));
      continue;
    }
    flushTable();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }
    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push({ type: "quote", text: line.replace(/^>\s*/, "") });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushOrderedList();
      list.push(bullet[1]!.trim());
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushList();
      orderedList.push(numbered[1]!.trim());
      continue;
    }
    flushList();
    flushOrderedList();
    paragraph.push(line);
  }
  if (math) blocks.push({ type: "display_math", text: math.join("\n") });
  flushParagraph();
  flushList();
  flushOrderedList();
  flushTable();
  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+\$|\\\([^)]+\\\))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 4px" }}>{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$")) return <InlineFormula key={index} formula={part.slice(1, -1)} />;
    if (part.startsWith("\\(") && part.endsWith("\\)")) return <InlineFormula key={index} formula={part.slice(2, -2)} />;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function isMarkdownTableLine(line: string): boolean {
  return line.includes("|") && line.split("|").filter((part) => part.trim().length > 0).length >= 2;
}

function InlineFormula({ formula }: { formula: string }) {
  return <MathFormula formula={formula} displayMode={false} />;
}

function FormulaBlock({ formula }: { formula: string }) {
  return (
    <div style={{ margin: "12px 0", padding: "10px 12px", border: "1px solid #dbeafe", borderRadius: 8, background: "#f8fafc", overflowX: "auto", color: "#0f172a" }}>
      <MathFormula formula={formula} displayMode />
    </div>
  );
}

function MathFormula({ formula, displayMode }: { formula: string; displayMode: boolean }) {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(normalizeLatex(formula), {
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
  if (!html) {
    return <code style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", color: "#0f172a" }}>{formula}</code>;
  }
  return (
    <span
      className={displayMode ? "study-math-display" : "study-math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function normalizeLatex(formula: string): string {
  return formula
    .replace(/\\\\/g, "\\")
    .replace(/\\text\{\s*W\/m\s*\}/g, "\\mathrm{W/m}")
    .trim();
}

function MarkdownTable({ rows }: { rows: string[][] }) {
  if (!rows.length) return null;
  const [headers, ...body] = rows;
  return (
    <div style={{ overflowX: "auto", margin: "10px 0 14px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <thead>
          <tr>
            {(headers ?? []).map((header, index) => (
              <th key={index} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "7px 8px", color: "#334155", background: "#f8fafc", fontWeight: 850 }}>
                {inlineMarkdown(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {(headers ?? row).map((_, cellIndex) => (
                <td key={cellIndex} style={{ borderBottom: rowIndex === body.length - 1 ? 0 : "1px solid #f1f5f9", padding: "7px 8px", verticalAlign: "top" }}>
                  {inlineMarkdown(row[cellIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StructuredValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <div style={{ color: "#6b7280" }}>No data recorded.</div>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <div style={{ whiteSpace: "pre-wrap" }}>{String(value)}</div>;
  }
  if (Array.isArray(value)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value.map((item, index) => (
          <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
            <StructuredValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr)", gap: "6px 12px", margin: 0 }}>
        {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
          <React.Fragment key={key}>
            <dt style={{ fontWeight: 750, color: "#6b7280" }}>{key}</dt>
            <dd style={{ margin: 0 }}>
              <StructuredValue value={entry} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return <div>{String(value)}</div>;
}
