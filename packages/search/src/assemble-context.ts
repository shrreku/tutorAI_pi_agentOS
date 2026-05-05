import type { UnifiedSearchHit } from "@studyagent/schemas";

export type AssembledAgentContext = {
  /** Compact narrative block for the model. */
  body: string;
  /** Citation handles aligned with bracket tags in `body`. */
  citations: Array<{ handle: string; refType: string; refId: string }>;
};

/**
 * Dedupe hits, preserve provenance, and trim to a byte-conscious budget for tools / Pi.
 */
export function assembleSearchContextForAgent(hits: UnifiedSearchHit[], maxChars: number): AssembledAgentContext {
  const seen = new Set<string>();
  const blocks: string[] = [];
  const citations: Array<{ handle: string; refType: string; refId: string }> = [];
  let used = 0;
  let i = 0;

  for (const h of hits) {
    const key = `${h.type}:${h.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    i += 1;
    const handle = `[${h.type}:${i}]`;
    const prov = h.provenance
      .map((p) => `${p.refType}:${p.refId}`)
      .filter(Boolean)
      .join(", ");
    const line = `${handle} (${h.title}) ${h.snippet}${prov ? ` — refs: ${prov}` : ""}`;
    if (used + line.length + 2 > maxChars) {
      break;
    }
    blocks.push(line);
    used += line.length + 2;
    for (const p of h.provenance) {
      citations.push({ handle, refType: p.refType, refId: p.refId });
    }
  }

  return {
    body: blocks.join("\n\n"),
    citations,
  };
}
