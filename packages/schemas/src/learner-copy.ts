export const FORBIDDEN_LEARNER_COPY_PATTERNS = [
  /\bdebug\b/i,
  /\braw\b/i,
  /\bprovenance\b/i,
  /\bLLM\b/,
  /\bcandidate_claim\b/i,
  /\bobjective_list\b/i,
  /\bsession_plan\b/i,
  /\bteaching_arc\b/i,
  /\b[a-z]+_ref\b/i,
  /\btutoring_ready\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];

const PRODUCT_COPY: Array<[RegExp, string]> = [
  [/\btutoring_ready\b/gi, "Ready to study"],
  [/\bobjective_list\b/gi, "session objectives"],
  [/\bsession_plan\b/gi, "lesson plan"],
  [/\bteaching_arc\b/gi, "learning path"],
  [/\bopen_provenance\b/gi, "open_evidence"],
  [/\bprovenance\b/gi, "Evidence"],
  [/\bLLM\b/g, "AI"],
  [/\bcandidate_claim\b/gi, "draft idea"],
  [/\bcandidate_write\b/gi, "draft save"],
  [/\bdebug\b/gi, "details"],
  [/\braw\b/gi, "source"],
];

export function learnerFacingPipelineStatus(status: string, options: { devMode?: boolean } = {}): string {
  if (options.devMode) return status.replace(/_/g, " ");
  return learnerSafeCopy(status, options).replace(/_/g, " ");
}

const NODE_TYPE_COPY: Record<string, string> = {
  source_section: "Source section",
  objective_list: "Session objectives",
  session_plan: "Lesson plan",
  study_plan: "Study plan",
  wiki_page: "Wiki page",
  weak_concept: "Needs practice",
  tutor_session: "Session",
  coverage_item: "Coverage item",
  coverage_record: "Coverage record",
  curriculum_module: "Module",
  candidate_claim: "Draft idea",
};

export function learnerFacingNodeTypeLabel(nodeType: string, options: { devMode?: boolean } = {}): string {
  if (options.devMode) return nodeType.replace(/_/g, " ");
  if (NODE_TYPE_COPY[nodeType]) return NODE_TYPE_COPY[nodeType];
  return learnerSafeCopy(nodeType, options).replace(/_/g, " ");
}

export function learnerSafeCopy(value: string, options: { devMode?: boolean } = {}): string {
  if (options.devMode) return value;
  let next = value;
  for (const [pattern, replacement] of PRODUCT_COPY) {
    next = next.replace(pattern, replacement);
  }
  next = next.replace(/\b[a-z]+_ref\b/gi, "reference");
  next = next.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "saved item");
  return next;
}

export function learnerSafeValue<T>(value: T, options: { devMode?: boolean } = {}): T {
  if (options.devMode) return value;
  if (typeof value === "string") return learnerSafeCopy(value) as T;
  if (Array.isArray(value)) return value.map((item) => learnerSafeValue(item, options)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, learnerSafeValue(entry, options)]),
    ) as T;
  }
  return value;
}

export function assertLearnerSafeCopy(value: unknown): string[] {
  const text = JSON.stringify(value);
  return FORBIDDEN_LEARNER_COPY_PATTERNS.flatMap((pattern) => {
    const match = text.match(pattern);
    return match ? [match[0]] : [];
  });
}
