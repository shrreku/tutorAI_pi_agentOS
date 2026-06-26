export type ContextRef = { refType: string; refId: string };

export function extractContextRefsFromToolSummary(toolSummary: unknown): ContextRef[] {
  if (!isJsonRecord(toolSummary)) return [];
  const tools = Array.isArray(toolSummary.tools) ? toolSummary.tools : [];
  const refs: ContextRef[] = [];
  for (const tool of tools) {
    if (!isJsonRecord(tool)) continue;
    const toolName = typeof tool.toolName === "string" ? tool.toolName : "";
    if (toolName !== "wiki.search") continue;
    refs.push(...parseRefs(tool.contextRefs));
  }
  return dedupeRefs(refs);
}

function parseRefs(value: unknown): ContextRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((ref): ref is Record<string, unknown> =>
      Boolean(ref && typeof ref === "object" && !Array.isArray(ref)),
    )
    .filter(
      (ref): ref is ContextRef => typeof ref.refType === "string" && typeof ref.refId === "string",
    );
}

function dedupeRefs(refs: ContextRef[]): ContextRef[] {
  const seen = new Set<string>();
  const deduped: ContextRef[] = [];
  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
