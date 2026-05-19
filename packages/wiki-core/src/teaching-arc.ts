export type TeachingArcBlockType =
  | "hook"
  | "prior_knowledge_probe"
  | "intuition"
  | "formal_definition"
  | "notation_formula"
  | "derivation_mechanism"
  | "everyday_example"
  | "industrial_example"
  | "analogy"
  | "contrast_case"
  | "misconception_warning"
  | "checkpoint"
  | "transfer_prompt"
  | "summary";

export type TeachingArcBlock = {
  id: string;
  type: TeachingArcBlockType;
  title: string;
  prompt: string;
  sourceRefs: unknown[];
};

export type ComposeTeachingArcInput = {
  objectiveId: string;
  objectiveTitle: string;
  objectiveSummary?: string | null;
  targetConceptNames?: string[];
  mustCoverItems?: Array<{ id?: string; title: string; itemFamily?: string; sourceRefs?: unknown[] }>;
  studentProfile?: {
    pacePreference?: string | null;
    depthPreference?: string | null;
    examplePreferencesJson?: Record<string, unknown>;
  } | null;
};

export type TeachingArc = {
  id: string;
  objectiveId: string;
  title: string;
  learnerFit: {
    pace: string;
    depth: string;
    exampleStyle: string;
  };
  blocks: TeachingArcBlock[];
  coverageItemIds: string[];
};

export type TeachingArcRuntimeState = {
  completedBlockIds?: string[];
  checkedCoverageItemIds?: string[];
  weakCoverageItemIds?: string[];
  recentMistakeConceptIds?: string[];
  learnerAskedForExample?: boolean;
};

export type AdaptedTeachingArc = TeachingArc & {
  activeBlock: TeachingArcBlock | null;
  nextBlocks: TeachingArcBlock[];
  adaptationReason: string;
};

export function composeTeachingArc(input: ComposeTeachingArcInput): TeachingArc {
  const pace = input.studentProfile?.pacePreference ?? "normal";
  const depth = input.studentProfile?.depthPreference ?? "balanced";
  const exampleStyle = resolveExampleStyle(input.studentProfile?.examplePreferencesJson);
  const concepts = input.targetConceptNames?.length ? input.targetConceptNames.join(", ") : input.objectiveTitle;
  const coverageItemIds = (input.mustCoverItems ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
  const sourceRefs = (input.mustCoverItems ?? []).flatMap((item) => item.sourceRefs ?? []).slice(0, 6);
  const formulaItems = (input.mustCoverItems ?? []).filter((item) => item.itemFamily === "formula" || item.itemFamily === "notation");
  const misconceptionItems = (input.mustCoverItems ?? []).filter((item) => item.itemFamily === "misconception" || item.itemFamily === "distinction");
  const mechanismItems = (input.mustCoverItems ?? []).filter((item) => item.itemFamily === "procedure" || item.itemFamily === "application");
  const analogyItems = (input.mustCoverItems ?? []).filter(
    (item) => item.itemFamily === "distinction" || item.itemFamily === "application" || item.itemFamily === "misconception",
  );

  const blocks: TeachingArcBlock[] = [
    block(input.objectiveId, "hook", "Why this matters", `Connect ${input.objectiveTitle} to the learner's goal before definitions.`, sourceRefs),
    block(input.objectiveId, "prior_knowledge_probe", "Quick diagnostic", `Ask one short question to check prerequisite intuition for ${concepts}.`, sourceRefs),
    block(input.objectiveId, "intuition", "Core intuition", `Explain the idea in plain language at a ${pace} pace.`, sourceRefs),
    block(input.objectiveId, "formal_definition", "Formal shape", `State the rigorous definition or rule for ${input.objectiveTitle}; keep depth ${depth}.`, sourceRefs),
  ];

  if (formulaItems.length) {
    blocks.push(
      block(
        input.objectiveId,
        "notation_formula",
        "Notation and formula",
        `Introduce notation/formulas: ${formulaItems.map((item) => item.title).join("; ")}.`,
        formulaItems.flatMap((item) => item.sourceRefs ?? []).slice(0, 6),
      ),
    );
  }

  if (mechanismItems.length) {
    blocks.push(
      block(
        input.objectiveId,
        "derivation_mechanism",
        "Mechanism",
        `Walk through the mechanism/derivation for: ${mechanismItems.map((item) => item.title).join("; ")}.`,
        mechanismItems.flatMap((item) => item.sourceRefs ?? []).slice(0, 6),
      ),
    );
  }

  blocks.push(
    block(input.objectiveId, "everyday_example", "Concrete example", `Use a ${exampleStyle} example to make ${input.objectiveTitle} tangible.`, sourceRefs),
    block(input.objectiveId, "industrial_example", "Applied example", `Show one realistic application or workflow involving ${concepts}.`, sourceRefs),
  );

  if (analogyItems.length) {
    blocks.push(
      block(
        input.objectiveId,
        "analogy",
        "Bridge analogy",
        `Use a short analogy to bridge confusing neighbors around ${input.objectiveTitle}.`,
        analogyItems.flatMap((item) => item.sourceRefs ?? []).slice(0, 6),
      ),
    );
  }

  if (misconceptionItems.length) {
    blocks.push(
      block(
        input.objectiveId,
        "misconception_warning",
        "Common trap",
        `Warn about: ${misconceptionItems.map((item) => item.title).join("; ")}.`,
        misconceptionItems.flatMap((item) => item.sourceRefs ?? []).slice(0, 6),
      ),
    );
  } else {
    blocks.push(block(input.objectiveId, "contrast_case", "Contrast case", `Contrast ${input.objectiveTitle} with a nearby idea to prevent overgeneralization.`, sourceRefs));
  }

  blocks.push(
    block(input.objectiveId, "checkpoint", "Checkpoint", `Ask a compact check-for-understanding question before moving on.`, sourceRefs),
    block(input.objectiveId, "transfer_prompt", "Transfer", `Ask the learner to apply ${input.objectiveTitle} in a new situation.`, sourceRefs),
    block(input.objectiveId, "summary", "Summary", `Summarize what was introduced, what was checked, and what remains weak.`, sourceRefs),
  );

  return {
    id: `arc_${stableId(input.objectiveId, input.objectiveTitle)}`,
    objectiveId: input.objectiveId,
    title: `Teaching arc · ${input.objectiveTitle}`,
    learnerFit: { pace, depth, exampleStyle },
    blocks,
    coverageItemIds,
  };
}

export function adaptTeachingArcForRuntime(arc: TeachingArc, state: TeachingArcRuntimeState = {}): AdaptedTeachingArc {
  const completed = new Set(state.completedBlockIds ?? []);
  const ordered = [...arc.blocks];
  let adaptationReason = "next_uncompleted_block";

  if ((state.recentMistakeConceptIds?.length ?? 0) > 0 || (state.weakCoverageItemIds?.length ?? 0) > 0) {
    priorityMove(ordered, ["misconception_warning", "contrast_case", "everyday_example", "checkpoint"]);
    adaptationReason = "misconception_or_weak_coverage_repair";
  } else if (state.learnerAskedForExample) {
    priorityMove(ordered, ["everyday_example", "industrial_example", "checkpoint"]);
    adaptationReason = "learner_requested_example";
  }

  const nextBlocks = ordered.filter((candidate) => !completed.has(candidate.id));
  return { ...arc, blocks: ordered, activeBlock: nextBlocks[0] ?? null, nextBlocks: nextBlocks.slice(0, 3), adaptationReason };
}

function priorityMove(blocks: TeachingArcBlock[], priority: TeachingArcBlockType[]): void {
  const rank = new Map(priority.map((type, index) => [type, index]));
  blocks.sort((a, b) => {
    const ar = rank.get(a.type);
    const br = rank.get(b.type);
    if (ar == null && br == null) return 0;
    if (ar == null) return 1;
    if (br == null) return -1;
    return ar - br;
  });
}

function block(objectiveId: string, type: TeachingArcBlockType, title: string, prompt: string, sourceRefs: unknown[]): TeachingArcBlock {
  return { id: `arcblk_${stableId(objectiveId, type, title)}`, type, title, prompt, sourceRefs };
}

function resolveExampleStyle(preferences?: Record<string, unknown>): string {
  const preferred = preferences?.["style"] ?? preferences?.["domain"];
  return typeof preferred === "string" && preferred.length > 0 ? preferred : "everyday-to-applied";
}

function stableId(...parts: string[]): string {
  let hash = 0;
  for (const char of parts.join("|") ) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}
