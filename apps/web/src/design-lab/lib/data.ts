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

export const sampleMonth = [
  { w: "W1", v: 62 },
  { w: "W2", v: 78 },
  { w: "W3", v: 45 },
  { w: "W4", v: 91 },
];

/** Daily study minutes for the current month — drives shaded calendar tiles. */
export const sampleMonthDays = [
  { day: 1, v: 42 },
  { day: 2, v: 68 },
  { day: 3, v: 0 },
  { day: 4, v: 55 },
  { day: 5, v: 91 },
  { day: 6, v: 24 },
  { day: 7, v: 38 },
  { day: 8, v: 72 },
  { day: 9, v: 45 },
  { day: 10, v: 0 },
  { day: 11, v: 58 },
  { day: 12, v: 83 },
  { day: 13, v: 31 },
  { day: 14, v: 66 },
  { day: 15, v: 49 },
  { day: 16, v: 0 },
  { day: 17, v: 77 },
  { day: 18, v: 52 },
  { day: 19, v: 94 },
  { day: 20, v: 28 },
  { day: 21, v: 61 },
  { day: 22, v: 44 },
  { day: 23, v: 0 },
  { day: 24, v: 70 },
  { day: 25, v: 36 },
  { day: 26, v: 88 },
  { day: 27, v: 53 },
  { day: 28, v: 19 },
  { day: 29, v: 64 },
  { day: 30, v: 41 },
];

export const samplePractice = [
  {
    id: "pr1",
    label: "Flashcards · Ch. 7 stereochemistry",
    meta: "12 cards · spaced recall",
    minutes: 8,
    status: "ready" as const,
  },
  {
    id: "pr2",
    label: "Quiz · SN2 nucleophiles",
    meta: "5 questions · adaptive",
    minutes: 7,
    status: "ready" as const,
  },
  {
    id: "pr3",
    label: "Worked example · Backside attack",
    meta: "step-by-step reveal",
    minutes: 10,
    status: "suggested" as const,
  },
];

export type NotebookDashboardMeta = {
  chapter: string;
  progress: number;
  modules: string;
  lastOpened: string;
  blurb: string;
};

export const notebookDashboardMeta: Record<string, NotebookDashboardMeta> = {
  "demo-orgchem": {
    chapter: "Ch. 7 Substitution",
    progress: 60,
    modules: "3 of 8 modules",
    lastOpened: "Thursday",
    blurb:
      "The bimolecular substitution pathway is nearly within reach. Two objectives remain — backside-attack stereochemistry and product separation — before the chapter closes and elimination begins.",
  },
  "demo-linalg": {
    chapter: "Vector Spaces",
    progress: 32,
    modules: "2 of 6 modules",
    lastOpened: "Tuesday",
    blurb:
      "Basis and dimension are the next foothold. A short session on linear independence will unlock the eigenvalue module.",
  },
  "demo-cell": {
    chapter: "Cell Division",
    progress: 88,
    modules: "7 of 8 modules",
    lastOpened: "Wednesday",
    blurb:
      "Mitosis wrap-up is within one session. Review spindle checkpoint evidence, then close the chapter with the practice quiz.",
  },
};

export function metaForNotebook(id: string, index: number): NotebookDashboardMeta {
  const known = notebookDashboardMeta[id];
  if (known) return known;
  const fallbacks = Object.values(notebookDashboardMeta);
  return (
    fallbacks[index % fallbacks.length] ?? {
      chapter: "In progress",
      progress: 40 + (index % 4) * 15,
      modules: "—",
      lastOpened: "Recently",
      blurb: "Open this notebook to resume your study map and tutor thread.",
    }
  );
}
