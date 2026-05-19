export function mergeAliases(existing: string[], incoming: string[]): string[] {
  const out = new Set<string>();
  for (const alias of [...existing, ...incoming]) {
    const trimmed = alias.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out];
}

function singularizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

export function normalizeConceptKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptKeyVariants(value: string): string[] {
  const base = normalizeConceptKey(value);
  if (!base) return [];
  const singular = base
    .split(" ")
    .map((token) => singularizeToken(token))
    .join(" ")
    .trim();
  return [...new Set([base, singular].filter(Boolean))];
}

export function registerConceptLookup(map: Map<string, string>, conceptId: string, names: string[]): void {
  for (const name of names) {
    for (const variant of conceptKeyVariants(name)) {
      map.set(variant, conceptId);
    }
  }
}

export function resolveConceptId(map: Map<string, string>, rawName: string): string | null {
  for (const variant of conceptKeyVariants(rawName)) {
    const id = map.get(variant);
    if (id) return id;
  }
  return null;
}

export type ExistingConceptRow = {
  id: string;
  canonicalName: string;
  aliases?: string[] | null;
};

export function buildConceptLookup(existingConcepts: ExistingConceptRow[]): {
  lookup: Map<string, string>;
  byId: Map<string, ExistingConceptRow>;
} {
  const lookup = new Map<string, string>();
  const byId = new Map<string, ExistingConceptRow>();
  for (const concept of existingConcepts) {
    byId.set(concept.id, concept);
    registerConceptLookup(lookup, concept.id, [concept.canonicalName, ...(concept.aliases ?? [])]);
  }
  return { lookup, byId };
}
