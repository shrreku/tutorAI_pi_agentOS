import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { tutorTraceQueryOptions } from "@studyagent/api-client";
import type { ChatTraceTurn } from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";
import { useFolioWorkspace, type SelectedNodeRef } from "./context.js";
import {
  reduceLiveTrace,
  traceStepsFromLive,
  traceStepsFromTurn,
  type LiveTraceState,
} from "./trace-mappers.js";
import { AgentMessage, AgentTrace, Composer, UserBubble } from "../ui/workspace.js";
import { Badge, Button, Skeleton } from "../ui/primitives.js";

type TutorMode = "learn" | "practice" | "revise" | "explore" | "wiki_maintenance";

export function FolioTutorChatPane({
  context,
  selectedNodeRefs = [],
}: {
  context: string;
  selectedNodeRefs?: SelectedNodeRef[];
}) {
  const { notebookId, draftTutorPrompt, setDraftTutorPrompt } = useFolioWorkspace();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<TutorMode>("learn");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [liveTrace, setLiveTrace] = useState<LiveTraceState>({
    tools: [],
    thinking: "",
    status: "idle",
  });
  const [retryError, setRetryError] = useState<string | null>(null);
  const lastFailedPrompt = useRef<string | null>(null);
  const modeRef = useRef(mode);
  const selectedRefsRef = useRef(selectedNodeRefs);
  const tutorActionRef = useRef<"prompt" | "steer">("prompt");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    selectedRefsRef.current = selectedNodeRefs;
  }, [selectedNodeRefs]);

  useEffect(() => {
    if (!draftTutorPrompt) return;
    setInput(draftTutorPrompt.prompt);
    if (draftTutorPrompt.mode) setMode(draftTutorPrompt.mode);
    setDraftTutorPrompt(null);
  }, [draftTutorPrompt, setDraftTutorPrompt]);

  const traceQuery = useQuery(
    tutorTraceQueryOptions(apiClient.request, notebookId, {
      ...(sessionId ? { sessionId } : {}),
      limit: 80,
    }),
  );

  const connection = useMemo(
    () =>
      fetchServerSentEvents(
        `/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/chat`,
        () => ({
          body: {
            data: {
              activeMode: modeRef.current,
              selectedNodeRefs: selectedRefsRef.current,
              action: tutorActionRef.current,
              ...(sessionId ? { sessionId } : {}),
            },
          },
        }),
      ),
    [notebookId, sessionId],
  );

  const { messages, sendMessage, isLoading, error, clear } = useChat({
    connection,
    onChunk(chunk) {
      const chunkAny = chunk as Record<string, unknown>;
      if (chunkAny.type === "SESSION_STARTED" && typeof chunkAny.sessionId === "string") {
        setSessionId(chunkAny.sessionId);
      }
      setLiveTrace((prev) => reduceLiveTrace(prev, chunkAny));
      if (chunk.type === "RUN_STARTED") setRunStatus("running");
      if (chunk.type === "RUN_FINISHED") {
        setRunStatus("completed");
        setRetryError(null);
        void queryClient.invalidateQueries({
          queryKey: tutorTraceQueryOptions(apiClient.request, notebookId).queryKey,
        });
      }
      if (chunk.type === "RUN_ERROR") {
        setRunStatus("failed");
        const message =
          typeof chunk.error?.message === "string"
            ? chunk.error.message
            : "The tutor run failed before it could finish.";
        setRetryError(message);
      }
    },
    onError(err) {
      setRunStatus("failed");
      setRetryError(err instanceof Error ? err.message : "Tutor request failed");
    },
  });

  useEffect(() => {
    clear();
    setInput("");
    setSessionId(null);
    setRunStatus("idle");
    setLiveTrace({ tools: [], thinking: "", status: "idle" });
  }, [notebookId, clear]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, traceQuery.data?.turns.length]);

  const historicalTurns = traceQuery.data?.turns ?? [];
  const showHistorical = messages.length === 0 && historicalTurns.length > 0;

  const handleSend = async (override?: string) => {
    const outgoing = (override ?? input).trim();
    if (!outgoing || isLoading) return;
    tutorActionRef.current = isLoading ? "steer" : "prompt";
    setRunStatus("running");
    setRetryError(null);
    setLiveTrace({ tools: [], thinking: "", status: "running" });
    if (!override) {
      lastFailedPrompt.current = outgoing;
      setInput("");
    }
    await sendMessage(outgoing);
  };

  const liveSteps = traceStepsFromLive(liveTrace);
  const isWorking = runStatus === "running" || isLoading;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TutorMode)}
            className="rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-[12px]"
          >
            <option value="learn">Learn</option>
            <option value="practice">Practice</option>
            <option value="revise">Revise</option>
            <option value="explore">Explore</option>
            <option value="wiki_maintenance">Source Wiki</option>
          </select>
        </label>
        {selectedNodeRefs.length > 0 ? (
          <Badge tone="accent">Node context active</Badge>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {traceQuery.isLoading && !showHistorical && messages.length === 0 ? (
          <Skeleton className="h-24 w-full" />
        ) : null}

        {showHistorical
          ? historicalTurns.map((turn) => <TurnBlock key={turn.id} turn={turn} />)
          : null}

        {messages.map((msg) => {
          const text = messageText(msg);
          if (!text) return null;
          if (msg.role === "user") return <UserBubble key={msg.id}>{text}</UserBubble>;
          return (
            <AgentMessage key={msg.id} trace={[]} working={false}>
              <MarkdownBody>{text}</MarkdownBody>
            </AgentMessage>
          );
        })}

        {isWorking || liveSteps.length > 0 ? (
          <AgentTrace steps={liveSteps} working={isWorking} defaultOpen />
        ) : null}

        {!showHistorical && messages.length === 0 && !traceQuery.isLoading ? (
          <div className="rounded-[var(--radius)] border border-dashed border-border bg-card/40 px-4 py-8 text-center">
            <p className="font-display text-[15px] font-semibold">Ask your tutor</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Start from your sources, a selected map node, or ask for a study plan.
            </p>
          </div>
        ) : null}

        {error || retryError ? (
          <div className="rounded-[var(--radius)] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {retryError ?? (error instanceof Error ? error.message : "Tutor error")}
            {lastFailedPrompt.current ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void handleSend(lastFailedPrompt.current ?? undefined)}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3">
        <Composer
          context={context}
          value={input}
          onChange={setInput}
          onSend={() => void handleSend()}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}

function TurnBlock({ turn }: { turn: ChatTraceTurn }) {
  const steps = traceStepsFromTurn(turn, false);
  return (
    <>
      {turn.userMessage ? <UserBubble>{turn.userMessage}</UserBubble> : null}
      {turn.assistantMessage ? (
        <AgentMessage trace={steps} working={false}>
          <MarkdownBody>{turn.assistantMessage}</MarkdownBody>
        </AgentMessage>
      ) : null}
    </>
  );
}

function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="folio-markdown text-[14px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function messageText(msg: { parts?: Array<{ type: string; content?: string }> }): string {
  if (!msg.parts?.length) return "";
  return msg.parts
    .filter((p) => p.type === "text" && typeof p.content === "string")
    .map((p) => p.content)
    .join("");
}
