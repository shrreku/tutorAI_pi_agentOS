import { normalizeConceptKey } from "./concept-lookup.js";

export function normalizeTopicKey(title: string): string {
  return normalizeConceptKey(title).replace(/\s+/g, "_");
}

export type ResolveTopicPageKeyInput = {
  notebookId: string;
  topicTitle: string;
  sourceHeadingPath?: string[];
  objectiveId?: string;
};

export function resolveTopicPageKey(input: ResolveTopicPageKeyInput): string {
  const normalized = normalizeTopicKey(input.topicTitle);
  const suffix = normalized.length > 0 ? normalized : "untitled";
  return `topic:${suffix}`;
}

export type TopicMergeCandidate = {
  title: string;
  aliases?: string[];
  sourceHeadingPath?: string[];
  objectiveIds?: string[];
  conceptIds?: string[];
};

function topicKeyVariants(title: string, aliases: string[] = []): string[] {
  const values = [title, ...aliases];
  return [...new Set(values.map((value) => normalizeTopicKey(value)).filter(Boolean))];
}

function headingPathTail(path: string[] | undefined): string | null {
  if (!path || path.length === 0) return null;
  const tail = path[path.length - 1]?.trim() ?? "";
  return tail.length > 0 ? normalizeTopicKey(tail) : null;
}

function overlapCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((value) => setB.has(value)).length;
}

export function shouldMergeTopics(a: TopicMergeCandidate, b: TopicMergeCandidate): boolean {
  const aKeys = topicKeyVariants(a.title, a.aliases);
  const bKeys = topicKeyVariants(b.title, b.aliases);
  if (aKeys.some((key) => bKeys.includes(key))) {
    return true;
  }

  const aHeading = headingPathTail(a.sourceHeadingPath);
  const bHeading = headingPathTail(b.sourceHeadingPath);
  if (aHeading && bKeys.includes(aHeading)) return true;
  if (bHeading && aKeys.includes(bHeading)) return true;

  const aObjectives = a.objectiveIds ?? [];
  const bObjectives = b.objectiveIds ?? [];
  if (
    aObjectives.length > 0 &&
    bObjectives.length > 0 &&
    overlapCount(aObjectives, bObjectives) > 0
  ) {
    return true;
  }

  const aConcepts = a.conceptIds ?? [];
  const bConcepts = b.conceptIds ?? [];
  if (aConcepts.length >= 2 && bConcepts.length >= 2 && overlapCount(aConcepts, bConcepts) >= 2) {
    return true;
  }

  return false;
}

export function conceptPageKey(conceptId: string): string {
  return `concept:${conceptId}`;
}

export type ExistingTopicPageRef = {
  pageKey: string;
  title: string;
  structuredJson?: Record<string, unknown>;
};

function topicTitleFromPage(page: ExistingTopicPageRef): string {
  const structuredTitle = page.structuredJson?.topicTitle;
  if (typeof structuredTitle === "string" && structuredTitle.trim().length > 0) {
    return structuredTitle.trim();
  }
  return page.title.replace(/^Topic ·\s*/i, "").trim();
}

function topicPageToMergeCandidate(page: ExistingTopicPageRef): TopicMergeCandidate {
  const title = topicTitleFromPage(page);
  const aliases: string[] = [];
  const structuredAliases = page.structuredJson?.aliases;
  if (Array.isArray(structuredAliases)) {
    for (const alias of structuredAliases) {
      if (typeof alias === "string" && alias.trim().length > 0) aliases.push(alias.trim());
    }
  }
  const headingPath = page.structuredJson?.sourceHeadingPath;
  return {
    title,
    aliases,
    ...(Array.isArray(headingPath)
      ? {
          sourceHeadingPath: headingPath.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : {}),
    conceptIds: Array.isArray(page.structuredJson?.conceptIds)
      ? page.structuredJson.conceptIds.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

export function resolveCanonicalTopicPageKey(input: {
  topicTitle: string;
  sourceId?: string;
  sourceHeadingPath?: string[];
  conceptIds?: string[];
  existingTopicPages?: ExistingTopicPageRef[];
}): { pageKey: string; legacyPageKeysToRetire: string[] } {
  const candidate: TopicMergeCandidate = {
    title: input.topicTitle,
    conceptIds: input.conceptIds ?? [],
    ...(input.sourceHeadingPath ? { sourceHeadingPath: input.sourceHeadingPath } : {}),
  };
  const normalizedKey = resolveTopicPageKey({
    notebookId: "",
    topicTitle: input.topicTitle,
    ...(input.sourceHeadingPath ? { sourceHeadingPath: input.sourceHeadingPath } : {}),
  });
  const existing = input.existingTopicPages ?? [];
  const legacyKeys: string[] = [];

  if (input.sourceId) {
    const legacyKey = `topic:${input.sourceId}`;
    const legacyPage = existing.find((page) => page.pageKey === legacyKey);
    if (legacyPage) {
      if (shouldMergeTopics(candidate, topicPageToMergeCandidate(legacyPage))) {
        if (legacyKey !== normalizedKey) legacyKeys.push(legacyKey);
        return { pageKey: normalizedKey, legacyPageKeysToRetire: legacyKeys };
      }
      return { pageKey: legacyKey, legacyPageKeysToRetire: [] };
    }
  }

  for (const page of existing) {
    if (input.sourceId && page.pageKey === `topic:${input.sourceId}`) continue;
    if (shouldMergeTopics(candidate, topicPageToMergeCandidate(page))) {
      return { pageKey: page.pageKey, legacyPageKeysToRetire: [] };
    }
  }

  return { pageKey: normalizedKey, legacyPageKeysToRetire: legacyKeys };
}

export function topicPageBelongsToSource(page: ExistingTopicPageRef, sourceId: string): boolean {
  if (page.pageKey === `topic:${sourceId}`) return true;
  if (page.structuredJson?.bootstrapSourceId === sourceId) return true;
  if (page.structuredJson?.sourceId === sourceId) return true;
  const topicKey = page.structuredJson?.topicKey;
  if (typeof topicKey === "string" && topicKey.length > 0) return true;
  return false;
}

export function loadTopicPagesForObjectiveConcepts(input: {
  topicPages: Array<{
    id: string;
    pageKey: string;
    title: string;
    structuredJson?: Record<string, unknown>;
  }>;
  conceptRows: Array<{ id: string; canonicalName: string }>;
  objectiveConceptIds: string[];
  moduleTopicTitles?: string[];
}): Array<{ id: string; pageKey: string; title: string }> {
  const wantedConceptIds = new Set(input.objectiveConceptIds);
  const conceptNames = new Set(
    input.conceptRows
      .filter((row) => wantedConceptIds.has(row.id))
      .map((row) => row.canonicalName.toLowerCase()),
  );
  const moduleTopics = new Set(
    (input.moduleTopicTitles ?? []).map((title) => normalizeTopicKey(title)),
  );

  const matches = input.topicPages.filter((page) => {
    const pageConceptIds = Array.isArray(page.structuredJson?.conceptIds)
      ? page.structuredJson.conceptIds.filter((entry): entry is string => typeof entry === "string")
      : [];
    if (pageConceptIds.some((conceptId) => wantedConceptIds.has(conceptId))) return true;

    const topicTitle = topicTitleFromPage(page).toLowerCase();
    if (conceptNames.has(topicTitle)) return true;
    if (moduleTopics.has(normalizeTopicKey(topicTitle))) return true;

    const structuredTopicKey = page.structuredJson?.topicKey;
    if (
      typeof structuredTopicKey === "string" &&
      moduleTopics.has(structuredTopicKey.replace(/^topic:/, ""))
    ) {
      return true;
    }
    return false;
  });

  return matches
    .slice(0, 8)
    .map((page) => ({ id: page.id, pageKey: page.pageKey, title: page.title }));
}
