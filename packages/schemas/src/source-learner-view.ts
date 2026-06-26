import {
  buildSourceReadiness,
  learnerSourceStatus,
  sourceReadinessComponent,
  sourceReadinessSchema,
  type SourceReadiness,
} from "./source-readiness.js";

export type SourceLearnerView = {
  id: string;
  title: string;
  readiness: SourceReadiness;
  learnerLabel: string;
  learnerDetail: string;
  tutoringReady: boolean;
  sourceWikiReady: boolean;
  projectionReady: boolean;
};

export function sourceReadinessFromLegacyStatus(status: string): SourceReadiness {
  const tutoringReady = status === "tutoring_ready" || status === "ready";
  const failed = status === "failed";
  const processing = !tutoringReady && !failed && status !== "uploaded";
  return buildSourceReadiness({
    retrieval: sourceReadinessComponent(!failed && !processing, {
      status: failed ? "failed" : processing ? "pending" : "ready",
    }),
    search: sourceReadinessComponent(tutoringReady, {
      status: tutoringReady ? "ready" : processing ? "pending" : "failed",
    }),
    wiki: sourceReadinessComponent(tutoringReady, {
      status: tutoringReady ? "ready" : processing ? "pending" : "failed",
    }),
    planning: sourceReadinessComponent(tutoringReady, {
      status: tutoringReady ? "ready" : processing ? "pending" : "failed",
    }),
    projection: sourceReadinessComponent(tutoringReady, {
      status: tutoringReady ? "ready" : processing ? "pending" : "failed",
    }),
    learnerSourceWiki: sourceReadinessComponent(tutoringReady, {
      status: tutoringReady ? "ready" : processing ? "pending" : "failed",
    }),
    tutoring: sourceReadinessComponent(tutoringReady, {
      status: failed ? "failed" : tutoringReady ? "ready" : processing ? "pending" : "pending",
      message: failed
        ? "This source failed to prepare."
        : processing
          ? "Still preparing for tutoring."
          : null,
    }),
  });
}

export function resolveSourceReadiness(input: {
  status: string;
  metadataJson?: Record<string, unknown> | null;
}): SourceReadiness {
  const raw = input.metadataJson?.sourceReadiness;
  const parsed = sourceReadinessSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return sourceReadinessFromLegacyStatus(input.status);
}

export function toSourceLearnerView(source: {
  id: string;
  title: string;
  status: string;
  metadataJson?: Record<string, unknown> | null;
}): SourceLearnerView {
  const readiness = resolveSourceReadiness(source);
  const copy = learnerSourceStatus(readiness);
  return {
    id: source.id,
    title: source.title,
    readiness,
    learnerLabel: copy.label,
    learnerDetail: copy.detail,
    tutoringReady: readiness.tutoring.ready,
    sourceWikiReady: readiness.learnerSourceWiki.ready,
    projectionReady: readiness.projection.ready,
  };
}
