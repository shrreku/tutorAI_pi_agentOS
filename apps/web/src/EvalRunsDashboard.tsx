import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SyntheticLearnerEvalRunRecord } from "@studyagent/schemas";

type EvalRunSummary = {
  id: string;
  status: SyntheticLearnerEvalRunRecord["status"];
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number;
  fixtureManifestId: string;
  fixtureVersion: string;
  notebookId: string;
  scenarioRunCount: number;
  passedScenarioCount: number;
  failedScenarioCount: number;
  personaIds: string[];
  scenarioIds: string[];
  notebookRefs: Array<{ refType: string; refId: string }>;
  transcriptLineCount: number;
};

type EvalRunListItem = {
  summary: EvalRunSummary;
  run: SyntheticLearnerEvalRunRecord;
};

type EvalRunListResponse = { runs: EvalRunListItem[] };
type EvalRunDetailResponse = { summary: EvalRunSummary; run: SyntheticLearnerEvalRunRecord };

export default function EvalRunsDashboard({
  selectedRunId,
  onSelectRun,
  onBackToNotebooks,
}: {
  selectedRunId?: string | null;
  onSelectRun: (runId: string) => void;
  onBackToNotebooks: () => void;
}) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["eval-runs"],
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EvalRunListResponse> => {
      const response = await fetch("/api/v1/eval/runs");
      if (!response.ok) {
        throw new Error(`Failed to load eval runs (${response.status})`);
      }
      return (await response.json()) as EvalRunListResponse;
    },
  });

  const runs = data?.runs ?? [];
  const selectedFromList = useMemo(
    () => runs.find((entry) => entry.summary.id === selectedRunId)?.run ?? runs[0]?.run ?? null,
    [runs, selectedRunId],
  );

  const selectedId = selectedFromList?.id ?? selectedRunId ?? null;
  const detailQuery = useQuery({
    queryKey: ["eval-run", selectedId],
    enabled: Boolean(selectedId),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EvalRunDetailResponse> => {
      const response = await fetch(`/api/v1/eval/runs/${encodeURIComponent(selectedId!)}`);
      if (!response.ok) {
        throw new Error(`Failed to load eval run (${response.status})`);
      }
      return (await response.json()) as EvalRunDetailResponse;
    },
  });

  const run = detailQuery.data?.run ?? selectedFromList;
  const summary = detailQuery.data?.summary ?? runs.find((entry) => entry.summary.id === run?.id)?.summary;

  return (
    <div className="study-shell" data-theme="mist">
      <main className="study-main">
        <header className="study-topbar">
          <div className="study-topbar-heading">
            <h1 className="study-topbar-title">Synthetic Learner Eval Runs</h1>
            <div className="study-topbar-subtitle">
              {runs.length ? `${runs.length} persisted runs` : "No eval runs yet"}
              {summary ? ` · ${summary.scenarioRunCount} scenario runs` : ""}
            </div>
          </div>
          <div className="study-topbar-actions">
            <button type="button" className="study-secondary-button" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" className="study-secondary-button" onClick={onBackToNotebooks}>
              Notebooks
            </button>
          </div>
        </header>

        {error instanceof Error && <pre className="study-error">{error.message}</pre>}

        <section className="study-workspace" style={{ display: "grid", gridTemplateColumns: "340px minmax(0, 1fr)", gap: 16 }}>
          <aside style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {isLoading && runs.length === 0 && <div className="study-empty">Loading eval runs…</div>}
            {!isLoading && runs.length === 0 && !error && <div className="study-empty">No persisted eval runs yet.</div>}
            {runs.map((entry) => (
              <button
                key={entry.summary.id}
                type="button"
                onClick={() => onSelectRun(entry.summary.id)}
                style={{
                  textAlign: "left",
                  border: entry.summary.id === selectedId ? "1px solid #2563eb" : "1px solid #e5e7eb",
                  background: entry.summary.id === selectedId ? "#eff6ff" : "white",
                  borderRadius: 12,
                  padding: 12,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <strong style={{ color: "#111827" }}>{entry.summary.id}</strong>
                  <span style={{ fontSize: 11, color: entry.summary.status === "failed" ? "#b91c1c" : "#065f46" }}>{entry.summary.status}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563" }}>
                  {entry.summary.fixtureManifestId} · {entry.summary.scenarioRunCount} runs · {entry.summary.failedScenarioCount} failed
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                  {entry.summary.personaIds.join(", ")}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                  {entry.summary.scenarioIds.join(", ")}
                </div>
              </button>
            ))}
          </aside>

          <article
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 16,
              minHeight: 420,
            }}
          >
            {run && summary ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22 }}>{summary.id}</h2>
                    <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                      {summary.status} · {summary.scenarioRunCount} scenario runs · {summary.transcriptLineCount} transcript lines
                    </div>
                  </div>
                  <div style={{ textAlign: "right", color: "#6b7280", fontSize: 12 }}>
                    <div>Started {new Date(summary.startedAt).toLocaleString()}</div>
                    <div>{summary.durationMs ? `${Math.round(summary.durationMs / 1000)}s` : "—"}</div>
                  </div>
                </div>

                <section>
                  <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Coverage</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                    <span>{summary.fixtureManifestId}@{summary.fixtureVersion}</span>
                    <span>Notebook {summary.notebookId}</span>
                    <span>{summary.passedScenarioCount} passed</span>
                    <span>{summary.failedScenarioCount} failed</span>
                  </div>
                </section>

                <section>
                  <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Scenario matrix</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {run.scenarioRuns.map((scenarioRun) => (
                      <div
                        key={scenarioRun.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <strong>{scenarioRun.personaId}</strong>
                          <span>{scenarioRun.status}</span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{scenarioRun.scenarioId}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                          {scenarioRun.assertions.filter((assertion) => assertion.status === "failed").length} failed assertions · {scenarioRun.steps.length} steps
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Transcript</h3>
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      background: "#0f172a",
                      color: "#e2e8f0",
                      borderRadius: 12,
                      overflow: "auto",
                      maxHeight: 260,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {run.transcript.length ? run.transcript.join("\n") : "No transcript persisted."}
                  </pre>
                </section>

                <section style={{ display: "grid", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Trace refs</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#4b5563" }}>
                    {run.traceRefs.length ? run.traceRefs.map((ref) => <span key={`${ref.refType}:${ref.refId}`}>{ref.refType}:{ref.refId}</span>) : <span>None</span>}
                  </div>
                </section>

                <section style={{ display: "grid", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Notebook refs</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#4b5563" }}>
                    {run.notebookRefs.length ? run.notebookRefs.map((ref) => <span key={`${ref.refType}:${ref.refId}`}>{ref.refType}:{ref.refId}</span>) : <span>None</span>}
                  </div>
                </section>
              </div>
            ) : (
              <div className="study-empty">Select a run to inspect its transcript, assertions, and trace refs.</div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
