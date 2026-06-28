export type NotebookSummary = {
  id: string;
  title: string;
  workspaceType: "personal_learner";
  updatedAt: string;
};

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

/** Portable handoff data. Production code must use @studyagent/api-client. */
export function useMe() {
  return { data: { user: { displayName: "Reader" } } };
}

export function useNotebooks() {
  return { data: sampleNotebooks };
}

export function useCredits() {
  return { data: { percentRemaining: 71 } };
}

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
