import { describe, expect, it } from "vitest";
import {
  MetricRegistry,
  recordAgenticCacheMetric,
  recordDurableEventMetric,
  recordHttpRequestMetric,
  recordInteractiveLearningActionMetric,
  recordSearchRetrievalFallbackMetric,
} from "./index.js";

describe("MetricRegistry", () => {
  it("renders counters, gauges, and histograms in Prometheus text format", () => {
    const registry = new MetricRegistry();

    registry.incrementCounter(
      "studyagent_test_total",
      2,
      { route: "/health", method: "GET" },
      "Test counter.",
    );
    registry.setGauge("studyagent_test_active", 3, { worker: "api" }, "Test gauge.");
    registry.observeHistogram(
      "studyagent_test_duration_seconds",
      0.02,
      { phase: "run" },
      "Test histogram.",
      [0.01, 0.05],
    );

    const rendered = registry.renderPrometheus();

    expect(rendered).toContain("# TYPE studyagent_test_total counter");
    expect(rendered).toContain('studyagent_test_total{method="GET",route="/health"} 2');
    expect(rendered).toContain("# TYPE studyagent_test_active gauge");
    expect(rendered).toContain('studyagent_test_active{worker="api"} 3');
    expect(rendered).toContain("# TYPE studyagent_test_duration_seconds histogram");
    expect(rendered).toContain('studyagent_test_duration_seconds_bucket{le="0.01",phase="run"} 0');
    expect(rendered).toContain('studyagent_test_duration_seconds_bucket{le="0.05",phase="run"} 1');
    expect(rendered).toContain('studyagent_test_duration_seconds_bucket{le="+Inf",phase="run"} 1');
    expect(rendered).toContain('studyagent_test_duration_seconds_count{phase="run"} 1');
  });

  it("records standard low-cardinality StudyAgent metrics", () => {
    const registry = new MetricRegistry();

    recordHttpRequestMetric({
      method: "post",
      route: "/api/v1/notebooks/:notebookId/tutor/chat",
      statusCode: 201,
      durationMs: 42,
      registry,
    });
    recordAgenticCacheMetric({
      namespace: "tutor_turn.host_context_snapshot",
      operation: "get",
      outcome: "hit",
      durationMs: 3,
      registry,
    });
    recordAgenticCacheMetric({
      namespace: "tutor_turn.retrieval_rows",
      operation: "invalidate",
      outcome: "success",
      deleted: 4,
      registry,
    });
    recordDurableEventMetric({
      eventType: "source.tutoring_ready",
      outcome: "success",
      durationMs: 8,
      registry,
    });
    recordInteractiveLearningActionMetric({
      actionName: "quiz.answer_submitted",
      blockKind: "quiz",
      rendererKind: "mcp_app",
      outcome: "success",
      emitsMasteryEvidence: true,
      durationMs: 12,
      registry,
    });
    recordSearchRetrievalFallbackMetric({ reason: "timeout", registry });

    const rendered = registry.renderPrometheus();

    expect(rendered).toContain(
      'studyagent_http_requests_total{method="POST",route="/api/v1/notebooks/:notebookId/tutor/chat",status_class="2xx"} 1',
    );
    expect(rendered).toContain(
      'studyagent_agentic_cache_operations_total{namespace="tutor_turn.host_context_snapshot",operation="get",outcome="hit"} 1',
    );
    expect(rendered).toContain(
      'studyagent_agentic_cache_deleted_entries_total{namespace="tutor_turn.retrieval_rows",operation="invalidate"} 4',
    );
    expect(rendered).toContain(
      'studyagent_notebook_events_appended_total{event_family="source",event_type="source.tutoring_ready",outcome="success"} 1',
    );
    expect(rendered).toContain(
      'studyagent_interactive_learning_actions_total{action_name="quiz.answer_submitted",block_kind="quiz",emits_mastery_evidence="true",outcome="success",renderer_kind="mcp_app"} 1',
    );
    expect(rendered).toContain('search_retrieval_fallback_total{reason="timeout"} 1');
  });
});
