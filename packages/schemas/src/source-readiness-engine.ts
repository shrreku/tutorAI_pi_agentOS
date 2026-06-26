import { buildSourceReadiness, sourceReadinessComponent } from "./source-readiness.js";

export type SourceReadinessSignals = {
  retrievalReady: boolean;
  wikiReady: boolean;
  planningReady: boolean;
  projectionReady: boolean;
  projectionConfigured?: boolean;
  projectionMessage?: string | null;
  tutoringReady: boolean;
  enrichmentReason?: string | undefined;
  updatedAt: string;
  mode?: "ingestion" | "postEnrichment";
};

export function buildSourceReadinessFromSignals(input: SourceReadinessSignals) {
  const {
    retrievalReady,
    wikiReady,
    planningReady,
    projectionReady,
    projectionConfigured,
    projectionMessage,
    tutoringReady,
    enrichmentReason,
    updatedAt,
    mode = "postEnrichment",
  } = input;

  const learnerSourceWikiReady = wikiReady && planningReady && projectionReady;

  const learnerSourceWikiStatus =
    mode === "ingestion"
      ? !wikiReady
        ? "degraded"
        : projectionConfigured
          ? "pending"
          : "degraded"
      : learnerSourceWikiReady
        ? "ready"
        : projectionReady
          ? "pending"
          : "degraded";

  const learnerSourceWikiMessage =
    mode === "ingestion"
      ? !wikiReady
        ? (enrichmentReason ?? "Source Wiki is still improving.")
        : projectionConfigured
          ? "Source Wiki is usable, but Study Map links are still projecting."
          : "Source Wiki is usable, but Study Map projection is unavailable."
      : learnerSourceWikiReady
        ? null
        : !wikiReady
          ? "Source Wiki pages are still compiling."
          : !planningReady
            ? "Learning plan bootstrap is still improving."
            : (projectionMessage ??
              "Source Wiki is usable, but Study Map links may still be improving.");

  return buildSourceReadiness({
    retrieval: sourceReadinessComponent(retrievalReady, {
      updatedAt,
      message: retrievalReady ? null : "No retrieval chunks were created for this source.",
    }),
    search: sourceReadinessComponent(true, { updatedAt }),
    wiki: sourceReadinessComponent(wikiReady, {
      updatedAt,
      status: wikiReady ? "ready" : "degraded",
      message:
        mode === "ingestion"
          ? wikiReady
            ? null
            : (enrichmentReason ?? "Source Wiki is still improving.")
          : null,
    }),
    planning: sourceReadinessComponent(planningReady, {
      updatedAt,
      status: planningReady ? "ready" : "degraded",
      message: planningReady
        ? null
        : mode === "ingestion"
          ? (enrichmentReason ?? "Learning plan bootstrap is still improving.")
          : "Learning plan bootstrap did not produce a planning context.",
    }),
    projection: sourceReadinessComponent(projectionReady, {
      updatedAt,
      status: projectionReady ? "ready" : projectionConfigured ? "pending" : "degraded",
      message: projectionReady
        ? null
        : projectionConfigured
          ? "Study Map projection is queued."
          : (projectionMessage ?? "Study Map projection is still improving."),
    }),
    learnerSourceWiki: sourceReadinessComponent(learnerSourceWikiReady, {
      updatedAt,
      status: learnerSourceWikiStatus,
      message: learnerSourceWikiMessage,
    }),
    tutoring: sourceReadinessComponent(tutoringReady, {
      updatedAt,
      status: tutoringReady ? "ready" : "pending",
      message: tutoringReady ? null : (enrichmentReason ?? "Tutor is still preparing this source."),
    }),
  });
}

export type IngestionSourceReadinessInput = {
  retrievalReady: boolean;
  enrichmentOk: boolean;
  enrichmentReason?: string;
  tutoringReady: boolean;
  projectionConfigured: boolean;
  updatedAt: string;
};

export function buildSourceReadinessDuringIngestion(input: IngestionSourceReadinessInput) {
  return buildSourceReadinessFromSignals({
    retrievalReady: input.retrievalReady,
    wikiReady: input.enrichmentOk,
    planningReady: input.enrichmentOk,
    projectionReady: false,
    projectionConfigured: input.projectionConfigured,
    tutoringReady: input.tutoringReady,
    enrichmentReason: input.enrichmentReason,
    updatedAt: input.updatedAt,
    mode: "ingestion",
  });
}

export type PostEnrichmentSourceReadinessInput = {
  wikiReady: boolean;
  planningReady: boolean;
  projectionReady: boolean;
  projectionMessage?: string | null;
  updatedAt: string;
};

export function buildSourceReadinessAfterEnrichment(input: PostEnrichmentSourceReadinessInput) {
  return buildSourceReadinessFromSignals({
    retrievalReady: true,
    wikiReady: input.wikiReady,
    planningReady: input.planningReady,
    projectionReady: input.projectionReady,
    projectionMessage: input.projectionMessage ?? null,
    tutoringReady: true,
    updatedAt: input.updatedAt,
    mode: "postEnrichment",
  });
}
