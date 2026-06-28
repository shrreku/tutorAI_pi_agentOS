import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import type { UIMessage } from "@tanstack/ai-client";
import type { ChatTraceResponse } from "@studyagent/schemas";
import { tutorTraceQueryOptions } from "@studyagent/api-client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GraduationCap, Send } from "lucide-react";
import {
  AgentTrace,
  updateLiveTraceRun,
  type LiveTraceRun,
} from "../../../AgentTrace.js";
import {
  latestAssistantMessageIndex,
  latestUserMessageIndex,
  traceTurnForAssistantMessage,
} from "../../../TutorPanel.js";
import { useWorkspaceShell } from "../../../workspace-shell-context.js";
import { apiClient } from "../lib/api-client.js";
import { Button } from "../primitives.js";

type SelectedNodeRef = { refType: string; refId: string };
type RunStatus = "idle" | "running" | "completed" | "failed";

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.content)
    .join("\n");
}

export function FolioTutorPanel({
  notebookId,
  selectedNodeRefs,
  sessionId: initialSessionId,
}: {
  notebookId: string;
  selectedNodeRefs: SelectedNodeRef[];
  sessionId?: string | null;
}) {
  const { draftTutorPrompt, setDraftTutorPrompt, setTutorRuntime } = useWorkspaceShell();
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [liveTraceRun, setLiveTraceRun] = useState<LiveTraceRun | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [retryableError, setRetryableError] = useState<string | null>(null);
  const modeRef = useRef<"socratic" | "direct">("socratic");
  const selectedNodeRefsRef = useRef(selectedNodeRefs);
  const tutorActionRef = useRef<"prompt" | "steer" | "followUp">("prompt");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const traceRefreshTimerRef = useRef<number | null>(null);

  selectedNodeRefsRef.current = selectedNodeRefs;

  const traceQuery = useQuery({
    ...(sessionId
      ? tutorTraceQueryOptions(apiClient.request, notebookId, { sessionId })
      : tutorTraceQueryOptions(apiClient.request, notebookId)),
    enabled: Boolean(notebookId),
  });

  const traceData = traceQuery.data ?? null;

  useEffect(() => {
    const latestTurn = traceData?.turns?.[traceData.turns.length - 1];
    setTutorRuntime({
      ...(sessionId ? { sessionId } : {}),
      ...(liveTraceRun?.id ? { runId: liveTraceRun.id } : {}),
      ...(latestTurn?.id ? { turnId: latestTurn.id } : {}),
    });
  }, [sessionId, liveTraceRun?.id, traceData?.turns, setTutorRuntime]);

  useEffect(() => {
    if (!draftTutorPrompt?.prompt) return;
    setDraft(draftTutorPrompt.prompt);
    setDraftTutorPrompt(null);
  }, [draftTutorPrompt, setDraftTutorPrompt]);

  const scheduleTraceRefresh = useCallback(() => {
    void traceQuery.refetch();
    if (traceRefreshTimerRef.current != null) {
      window.clearTimeout(traceRefreshTimerRef.current);
    }
    traceRefreshTimerRef.current = window.setTimeout(() => {
      traceRefreshTimerRef.current = null;
      void traceQuery.refetch();
    }, 900);
  }, [traceQuery]);

  const connection = useMemo(
    () =>
      fetchServerSentEvents(
        `/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/chat`,
        () => ({
          body: {
            data: {
              activeMode: modeRef.current,
              selectedNodeRefs: selectedNodeRefsRef.current,
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
      setLiveTraceRun((prev) => updateLiveTraceRun(prev, chunkAny));
      if (chunk.type === "RUN_STARTED") {
        setRunStatus("running");
      } else if (chunk.type === "RUN_FINISHED") {
        tutorActionRef.current = "prompt";
        setRunStatus("completed");
        setRetryableError(null);
        scheduleTraceRefresh();
      } else if (chunk.type === "RUN_ERROR") {
        tutorActionRef.current = "prompt";
        setRunStatus("failed");
        const errorMessage =
          typeof (chunk as { error?: { message?: string } }).error?.message === "string"
            ? (chunk as { error: { message: string } }).error.message
            : "The tutor run failed before it could finish.";
        setRetryableError(errorMessage);
        scheduleTraceRefresh();
      }
    },
    onError(err) {
      setRunStatus("failed");
      setRetryableError(err instanceof Error ? err.message : "The tutor run failed.");
      setLiveTraceRun((prev) =>
        prev ? { ...prev, status: "failed", completedAt: Date.now() } : prev,
      );
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, traceData?.turns.length, liveTraceRun]);

  useEffect(() => {
    return () => {
      if (traceRefreshTimerRef.current != null) {
        window.clearTimeout(traceRefreshTimerRef.current);
      }
    };
  }, []);

  const submit = useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      if (!text || isLoading) return;
      tutorActionRef.current = isLoading ? "steer" : "prompt";
      setRunStatus("running");
      setRetryableError(null);
      setLiveTraceRun(null);
      void sendMessage(text);
      setDraft("");
    },
    [draft, isLoading, sendMessage],
  );

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const activeTraceData: ChatTraceResponse | null = traceData;

  return (
    <div className="folio-tutor-pane">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
          <span className="font-display text-[15px] font-semibold">TutorBook</span>
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            grounded in your sources
          </span>
        </div>
      </div>

      <div className="folio-tutor-messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="font-display text-[15px] italic text-muted-foreground">
            Ask a question about your current study focus, or continue where you left off.
          </p>
        ) : null}

        {messages.map((message, index) => {
          const traceTurn = traceTurnForAssistantMessage(messages, index, activeTraceData);
          const latestUserIndex = latestUserMessageIndex(messages);
          const isLatestAssistant =
            message.role !== "user" && index === latestAssistantMessageIndex(messages);
          const isActiveAssistantTurn = isLatestAssistant && index > latestUserIndex;
          const isLatestUser = message.role === "user" && index === latestUserIndex;
          const showInlineWorkView =
            isLatestUser &&
            (runStatus === "running" || runStatus === "failed" || isLoading) &&
            latestAssistantMessageIndex(messages) <= latestUserIndex;
          const showAssistantWorkView =
            message.role !== "user" &&
            isActiveAssistantTurn &&
            (liveTraceRun != null || traceTurn != null || runStatus === "failed");

          return (
            <div key={message.id} className="mb-4">
              {message.role === "user" ? (
                <div className="flex justify-end">
                  <div className="folio-user-bubble">{messageText(message)}</div>
                </div>
              ) : null}

              {showInlineWorkView ? (
                <AgentTrace
                  traceTurn={null}
                  liveRun={liveTraceRun}
                  runStatus={runStatus}
                  showDiagnostics={false}
                  retryErrorMessage={retryableError}
                />
              ) : null}

              {showAssistantWorkView ? (
                <AgentTrace
                  traceTurn={traceTurn}
                  liveRun={liveTraceRun}
                  runStatus={runStatus}
                  assistantMessage={messageText(message)}
                  showDiagnostics={false}
                  retryErrorMessage={retryableError}
                />
              ) : null}

              {message.role !== "user" && !isActiveAssistantTurn && traceTurn ? (
                <AgentTrace
                  traceTurn={traceTurn}
                  liveRun={null}
                  runStatus="idle"
                  assistantMessage={messageText(message)}
                  showDiagnostics={false}
                />
              ) : null}

              {message.role !== "user" &&
              !(isActiveAssistantTurn && (runStatus === "running" || isLoading)) ? (
                <div className="folio-assistant-block">
                  <div className="folio-assistant-header">
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                    TutorBook
                  </div>
                  <div className="folio-assistant-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText(message)}</ReactMarkdown>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {(error || retryableError) && !isLoading ? (
          <div className="mt-4 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error?.message ?? retryableError}
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => clear()}>
                Clear and retry
              </Button>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="folio-tutor-composer">
        <label className="sr-only" htmlFor="folio-tutor-composer">
          Message tutor
        </label>
        <textarea
          id="folio-tutor-composer"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Ask your tutor…"
          className="w-full resize-none rounded-[var(--radius)] border border-border bg-background px-3 py-2 font-display text-[15px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isLoading}
        />
        <div className="mt-2 flex justify-end">
          <Button variant="accent" size="sm" onClick={() => submit()} disabled={isLoading || !draft.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
