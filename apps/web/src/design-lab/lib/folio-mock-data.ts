import type { NotebookSummary } from "../../routing/api.js";

export const folioMe = {
  user: {
    displayName: "Alex Rivera",
    email: "alex.rivera@example.com",
  },
};

export const folioCredits = {
  percentRemaining: 71,
  exhausted: false,
};

export const folioStudyToday = {
  minutes: 47,
  goal: 60,
};

export const folioCreditPacks = [
  {
    id: "pack-starter",
    label: "Starter pack",
    description: "Enough for a week of daily tutor sessions.",
    priceCents: 999,
    creditType: "tutor",
  },
  {
    id: "pack-semester",
    label: "Semester pack",
    description: "Best value for an active study term.",
    priceCents: 2499,
    creditType: "tutor",
  },
];

export const folioTemplates = [
  {
    id: "tpl-orgchem",
    title: "Organic Chemistry I",
    topic: "Substitution & elimination",
    sourceLevel: "Undergraduate",
    estimatedMinutes: 480,
    studyMode: "Guided curriculum",
    expectedOutcome: "Confident SN1/SN2/E1/E2 reasoning",
    description:
      "A structured path through substitution and elimination — from mechanism intuition to stereochemical prediction.",
  },
  {
    id: "tpl-linalg",
    title: "Linear Algebra",
    topic: "Vector spaces & eigenvalues",
    sourceLevel: "Undergraduate",
    estimatedMinutes: 360,
    studyMode: "Problem-first",
    expectedOutcome: "Fluency with bases, rank, and diagonalization",
    description:
      "Build geometric intuition first, then connect matrix algebra to applications in science and engineering.",
  },
  {
    id: "tpl-cell",
    title: "Cell Biology",
    topic: "Division & signaling",
    sourceLevel: "Introductory",
    estimatedMinutes: 300,
    studyMode: "Evidence-led",
    expectedOutcome: "Trace pathways from receptor to phenotype",
    description:
      "Follow cell-cycle checkpoints and signaling cascades with source-grounded tutor explanations.",
  },
];

export const folioSources = [
  { id: "src-1", title: "Clayden · Ch. 7", notebookTitle: "Organic Chemistry I" },
  { id: "src-2", title: "SN2_Mechanisms.pdf", notebookTitle: "Organic Chemistry I" },
  { id: "src-3", title: "Lecture 14 slides", notebookTitle: "Organic Chemistry I" },
];

export type FolioNotebookMeta = {
  chapter: string;
  progress: number;
  modules: string;
  lastOpened: string;
  blurb: string;
};

export const folioNotebookMeta: Record<string, FolioNotebookMeta> = {
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

export const folioNotebooks: NotebookSummary[] = [
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

export function metaForFolioNotebook(id: string, index: number): FolioNotebookMeta {
  const known = folioNotebookMeta[id];
  if (known) return known;
  const fallbacks = Object.values(folioNotebookMeta);
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

export const folioPlan = [
  { id: "p1", label: "Read §4.2 · Chiral centers", minutes: 8, status: "done" as const },
  { id: "p2", label: "Practice 5 stereocenter cards", minutes: 5, status: "active" as const },
  { id: "p3", label: "Quiz · Identifying stereocenters", minutes: 7, status: "todo" as const },
  { id: "p4", label: "Worked example · SN2 product", minutes: 6, status: "todo" as const },
];

export const folioActivity = [
  {
    id: "a1",
    kind: "quiz",
    title: "Completed quiz · Stereochemistry",
    meta: "80% · mastered chiral configuration",
    at: "2h ago",
    notebookId: "demo-orgchem",
  },
  {
    id: "a2",
    kind: "source",
    title: "Ingested SN2_Mechanisms.pdf",
    meta: "10 flashcards · 3 quiz questions",
    at: "5h ago",
    notebookId: "demo-orgchem",
  },
  {
    id: "a3",
    kind: "tutor",
    title: "Tutor session · Walden inversion",
    meta: "cited Ch. 7 p. 142",
    at: "1d ago",
    notebookId: "demo-orgchem",
  },
];

export const folioWeek = [
  { d: "M", v: 40 },
  { d: "T", v: 72 },
  { d: "W", v: 26 },
  { d: "T", v: 91 },
  { d: "F", v: 55 },
  { d: "S", v: 18 },
  { d: "S", v: 63 },
];

export const folioMonthDays = [
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

export const folioPractice = [
  {
    id: "pr1",
    label: "Flashcards · Ch. 7 stereochemistry",
    meta: "12 cards · spaced recall",
    minutes: 8,
    status: "ready" as const,
    notebookId: "demo-orgchem",
  },
  {
    id: "pr2",
    label: "Quiz · SN2 nucleophiles",
    meta: "5 questions · adaptive",
    minutes: 7,
    status: "ready" as const,
    notebookId: "demo-orgchem",
  },
  {
    id: "pr3",
    label: "Worked example · Backside attack",
    meta: "step-by-step reveal",
    minutes: 10,
    status: "suggested" as const,
    notebookId: "demo-orgchem",
  },
];

export type FolioWorkspaceSurface =
  | "study_map"
  | "reading"
  | "interactive"
  | "app"
  | "practice"
  | "tutor";

export const FOLIO_SURFACE_LABELS: Record<FolioWorkspaceSurface, string> = {
  study_map: "Study map",
  reading: "Reading",
  interactive: "Interactive",
  app: "App",
  practice: "Practice",
  tutor: "Tutor",
};

export function folioNotebookBootstrap(notebookId: string) {
  const notebook = folioNotebooks.find((n) => n.id === notebookId) ?? folioNotebooks[0]!;
  const meta = metaForFolioNotebook(notebook.id, 0);
  return {
    notebook,
    sourceSummary: { total: 7, ready: 7, processing: 0, failed: 0 },
    studySummary: {
      moduleTitle: meta.chapter,
      objectiveTitle: "SN2 inversion",
      status: "ready" as const,
      activeSessionId: "sess-demo-1",
    },
    allowedSurfaces: [
      "study_map",
      "reading",
      "interactive",
      "app",
      "practice",
    ] as FolioWorkspaceSurface[],
    fallbackReason: null as string | null,
  };
}

export const folioEvidence = [
  {
    id: "ev-1",
    source: "Clayden · Ch. 7",
    page: "p. 142",
    excerpt:
      "The nucleophile approaches from the side opposite the leaving group, forcing the three remaining substituents through a planar transition state.",
  },
  {
    id: "ev-2",
    source: "Lecture 14",
    page: "slide 9",
    excerpt: "Walden inversion: stereocentre configuration is inverted in a single concerted SN2 step.",
  },
  {
    id: "ev-3",
    source: "SN2_Mechanisms.pdf",
    page: "§2.1",
    excerpt: "Polar aprotic solvents maximize nucleophile availability without solvating the anion.",
  },
];
