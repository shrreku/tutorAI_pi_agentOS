import { useQuery } from "@tanstack/react-query";
import {
  fetchCredits,
  fetchMe,
  fetchNotebooks,
  fetchStudyTemplates,
  type MeResponse,
  type NotebookSummary,
  type StudyTemplateSummary,
} from "../../routing/api.js";
import { fetchNotebookSources, notebookSourcesQueryKey } from "../../notebook-queries.js";
import type { SourceLearnerView } from "@studyagent/schemas";

/**
 * The design lab talks to the real /api/v1 backend through the app's existing
 * client functions, so every direction renders live data when the API is up and
 * graceful empty states when it is not.
 */

export function useMe() {
  return useQuery<MeResponse>({ queryKey: ["dl", "me"], queryFn: fetchMe, retry: false });
}

export function useNotebooks() {
  return useQuery<NotebookSummary[]>({
    queryKey: ["dl", "notebooks"],
    queryFn: fetchNotebooks,
    retry: false,
  });
}

export function useCredits() {
  return useQuery({ queryKey: ["dl", "credits"], queryFn: fetchCredits, retry: false });
}

export function useTemplates() {
  return useQuery<StudyTemplateSummary[]>({
    queryKey: ["dl", "templates"],
    queryFn: fetchStudyTemplates,
    retry: false,
  });
}

export function useNotebookSources(notebookId: string | null) {
  return useQuery<SourceLearnerView[]>({
    queryKey: notebookSourcesQueryKey(notebookId),
    enabled: Boolean(notebookId),
    queryFn: () => fetchNotebookSources(notebookId as string) as Promise<SourceLearnerView[]>,
    retry: false,
  });
}

export type SourceReadiness = {
  total: number;
  ready: number;
  processing: number;
  failed: number;
};

export function summarizeSources(sources: SourceLearnerView[] | undefined): SourceReadiness {
  const list = sources ?? [];
  return {
    total: list.length,
    ready: list.filter((s) => s.tutoringReady).length,
    processing: list.filter((s) => !s.tutoringReady && s.readiness?.tutoring?.status === "pending")
      .length,
    failed: list.filter((s) => s.readiness?.tutoring?.status === "failed").length,
  };
}

/**
 * Sample fallbacks for surfaces whose live endpoints need an active study
 * session (graph projection, mastery, activity feed). Clearly labelled in the
 * UI as representative so nothing fakes real progress numbers.
 */
export const sampleNotebooks: NotebookSummary[] = [
  {
    id: "demo-orgchem",
    title: "Organic Chemistry I",
    workspaceType: "personal_learner",
    updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "demo-linalg",
    title: "Linear Algebra",
    workspaceType: "personal_learner",
    updatedAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
  {
    id: "demo-cell",
    title: "Cell Biology",
    workspaceType: "personal_learner",
    updatedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
  },
];

export const sampleMastery = [
  { concept: "SN2 mechanism", value: 92, trend: "up" as const },
  { concept: "Nucleophilicity", value: 74, trend: "up" as const },
  { concept: "Leaving groups", value: 68, trend: "flat" as const },
  { concept: "Stereochemistry", value: 45, trend: "down" as const, review: true },
];

export const samplePlan = [
  { id: "p1", label: "Read §4.2 · Chiral centers", minutes: 8, status: "done" as const },
  { id: "p2", label: "Practice 5 stereocenter cards", minutes: 5, status: "active" as const },
  { id: "p3", label: "Quiz · Identifying stereocenters", minutes: 7, status: "todo" as const },
  { id: "p4", label: "Worked example · SN2 product", minutes: 6, status: "todo" as const },
];

export const sampleActivity = [
  {
    id: "a1",
    kind: "quiz",
    title: "Completed quiz · Stereochemistry",
    meta: "80% · mastered chiral configuration",
    at: "2h ago",
  },
  {
    id: "a2",
    kind: "source",
    title: "Ingested SN2_Mechanisms.pdf",
    meta: "10 flashcards · 3 quiz questions",
    at: "5h ago",
  },
  {
    id: "a3",
    kind: "tutor",
    title: "Tutor session · Walden inversion",
    meta: "cited Ch. 7 p. 142",
    at: "1d ago",
  },
];

export const sampleWeek = [
  { d: "M", v: 40 },
  { d: "T", v: 72 },
  { d: "W", v: 26 },
  { d: "T", v: 91 },
  { d: "F", v: 55 },
  { d: "S", v: 18 },
  { d: "S", v: 63 },
];
