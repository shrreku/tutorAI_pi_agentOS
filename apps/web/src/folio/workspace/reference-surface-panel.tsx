import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { referenceSurfaceQueryOptions } from "@studyagent/api-client";
import type { GraphCanvasNode, ReferenceBlock, ReferenceSurface } from "@studyagent/schemas";
import { learnerFacingSurfaceStatus, visibleReferenceBlocks } from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";
import { submitQuizAnswerAction } from "../../interactive-learning/action-client.js";
import { normalizeQuizQuestions } from "../../quiz-utils.js";
import { useFolioWorkspace } from "./context.js";
import { referenceSurfaceNodeId } from "./node-ref.js";
import { Badge, Button, Skeleton } from "../ui/primitives.js";

export function FolioReferenceSurfacePanel({
  notebookId,
  node,
  surfaceKind,
}: {
  notebookId: string;
  node: GraphCanvasNode | null;
  surfaceKind: "reading" | "practice" | "interactive" | "app";
}) {
  const nodeId = node ? referenceSurfaceNodeId(node) : "";
  const surfaceQuery = useQuery({
    ...referenceSurfaceQueryOptions(apiClient.request, notebookId, nodeId),
    enabled: Boolean(nodeId),
  });

  if (!node) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <p className="max-w-sm text-[14px] text-muted-foreground">
          Select a node on the Study Map to open {surfaceKind} content here.
        </p>
      </div>
    );
  }

  if (surfaceQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (surfaceQuery.isError || !surfaceQuery.data) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <p className="text-[14px] text-destructive">Could not load surface for this node.</p>
      </div>
    );
  }

  const surface = surfaceQuery.data;
  const status = learnerFacingSurfaceStatus({
    surfaceType: surface.surfaceType,
    status: surface.status,
    quality: surface.quality,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold leading-tight">{surface.title}</h2>
          {status ? <Badge tone="neutral">{status}</Badge> : null}
        </div>
        {surface.summary ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{surface.summary}</p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <SurfaceBody notebookId={notebookId} surface={surface} surfaceKind={surfaceKind} />
      </div>
    </div>
  );
}

function SurfaceBody({
  notebookId,
  surface,
  surfaceKind,
}: {
  notebookId: string;
  surface: ReferenceSurface;
  surfaceKind: "reading" | "practice" | "interactive" | "app";
}) {
  const blocks = visibleReferenceBlocks(surface);
  const quizBlock = surface.interactiveBlocks.find((b) => b.kind === "quiz");

  if (surfaceKind === "practice" || quizBlock) {
    return <PracticeFromSurface notebookId={notebookId} surface={surface} />;
  }

  if (surfaceKind === "interactive") {
    const sim = blocks.find((b) => b.kind === "step_list" || b.kind === "example");
    if (sim) return <BlockRenderer block={sim} />;
  }

  if (!blocks.length) {
    return (
      <p className="text-[14px] text-muted-foreground">
        No {surfaceKind} content is available for this node yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: ReferenceBlock }) {
  if (block.kind === "markdown" || block.kind === "summary" || block.kind === "definition") {
    const text = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
    return (
      <section className="folio-markdown rounded-[var(--radius)] border border-border bg-card p-4">
        {block.title ? (
          <h3 className="mb-2 font-display text-[16px] font-semibold">{block.title}</h3>
        ) : null}
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {text}
        </ReactMarkdown>
      </section>
    );
  }

  if (block.kind === "step_list" && Array.isArray(block.content)) {
    return (
      <ol className="space-y-3">
        {(block.content as Array<{ title?: string; body?: string }>).map((step, i) => (
          <li key={i} className="flex gap-3 rounded-[var(--radius)] border border-border bg-card p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/12 text-[12px] font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              {step.title ? <div className="text-[13.5px] font-medium">{step.title}</div> : null}
              {step.body ? <div className="text-[13px] text-muted-foreground">{step.body}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (block.kind === "question_list" && Array.isArray(block.content)) {
    return (
      <ul className="space-y-2">
        {(block.content as string[]).map((q, i) => (
          <li key={i} className="rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-[13.5px]">
            {q}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-[var(--radius)] border border-border bg-muted/40 p-3 text-[12px]">
      {JSON.stringify(block.content, null, 2)}
    </pre>
  );
}

function PracticeFromSurface({
  notebookId,
  surface,
}: {
  notebookId: string;
  surface: ReferenceSurface;
}) {
  const queryClient = useQueryClient();
  const { setDraftTutorPrompt } = useFolioWorkspace();
  const questions = normalizeQuizQuestions(
    surface.blocks.find((b) => b.kind === "question_list")?.content ??
      surface.interactiveBlocks.find((b) => b.kind === "quiz")?.content,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (input: { questionId: string; answer: string; isCorrect: boolean }) => {
      const question = questions.find((q) => q.id === input.questionId);
      if (!question) throw new Error("Question not found");
      return submitQuizAnswerAction({
        notebookId,
        surface,
        question,
        answer: input.answer,
        isCorrect: input.isCorrect,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: referenceSurfaceQueryOptions(apiClient.request, notebookId, surface.nodeRef.refId)
          .queryKey,
      });
    },
  });

  if (!questions.length) {
    return (
      <p className="text-[14px] text-muted-foreground">No practice questions for this node yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-[var(--radius)] border border-border bg-card p-4">
          <p className="font-display text-[15px] font-semibold">
            {index + 1}. {question.prompt}
          </p>
          <div className="mt-3 space-y-2">
            {question.choices.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-[13.5px] hover:bg-muted/50"
              >
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === option}
                  onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: option }))}
                />
                {option}
              </label>
            ))}
          </div>
          <Button
            size="sm"
            className="mt-3"
            disabled={!answers[question.id] || submitMutation.isPending}
            onClick={() => {
              const answer = answers[question.id] ?? "";
              const isCorrect = question.answer ? answer === question.answer : false;
              setFeedback(isCorrect ? "Correct" : "Submitted — review the explanation.");
              void submitMutation.mutate({ questionId: question.id, answer, isCorrect });
            }}
          >
            Submit answer
          </Button>
        </div>
      ))}
      {feedback ? <p className="text-[13px] text-accent">{feedback}</p> : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setDraftTutorPrompt({
            prompt: `Help me understand the practice questions for "${surface.title}".`,
            mode: "practice",
          })
        }
      >
        Ask tutor about this practice
      </Button>
    </div>
  );
}