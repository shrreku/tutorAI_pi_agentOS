export type WikiLintSeverity = "info" | "warn" | "error";

export type WikiLintIssue = {
  code: string;
  severity: WikiLintSeverity;
  message: string;
  refs?: Array<{ refType: string; refId: string }>;
};

export type WikiLintNotebookInput = {
  pages: Array<{
    id: string;
    title?: string;
    pageType: string;
    pageKey: string;
    markdown: string;
    sourceClaimIds: string[];
    status: string;
    updatedAt: string | Date;
    structuredJson: Record<string, unknown>;
  }>;
  concepts: Array<{ id: string; canonicalName: string }>;
  claims: Array<{ id: string; status: string; claimText: string; metadataJson: Record<string, unknown> }>;
  graphRelations: Array<{
    relationType: string;
    sourceNodeType: string;
    sourceNodeId: string;
    targetNodeType: string;
    targetNodeId: string;
  }>;
};

function daysSince(iso: string | Date): number {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return (Date.now() - t) / 86_400_000;
}

/** Pure notebook-level wiki health checks (GF-0403). */
export function lintNotebookWiki(input: WikiLintNotebookInput): WikiLintIssue[] {
  const issues: WikiLintIssue[] = [];
  const conceptIds = new Set(input.concepts.map((c) => c.id));

  const names = new Map<string, string[]>();
  for (const c of input.concepts) {
    const k = c.canonicalName.trim().toLowerCase();
    const arr = names.get(k) ?? [];
    arr.push(c.id);
    names.set(k, arr);
  }
  for (const [k, ids] of names) {
    if (ids.length > 1) {
      issues.push({
        code: "duplicate_concepts",
        severity: "warn",
        message: `Duplicate concept name "${k}" (${ids.length} rows)`,
        refs: ids.map((id) => ({ refType: "concept", refId: id })),
      });
    }
  }

  for (const p of input.pages) {
    if (p.pageType === "concept") {
      const cid = p.structuredJson.conceptId;
      if (typeof cid === "string" && !conceptIds.has(cid)) {
        issues.push({
          code: "orphan_wiki_page",
          severity: "error",
          message: `Wiki page ${p.id} references missing concept ${cid}`,
          refs: [{ refType: "wiki_page", refId: p.id }],
        });
      }
    }

    const md = p.markdown.trim();
    const citesClaimInBody = /`clm_[a-z0-9]+`/i.test(md) || /claim\s*`?clm_/i.test(md);
    const hasCitation = p.sourceClaimIds.length > 0 || citesClaimInBody;
    if (md.length > 120 && !hasCitation && p.pageType !== "source_summary") {
      issues.push({
        code: "missing_citations",
        severity: "warn",
        message: `Page "${p.title ?? p.pageKey}" has long markdown but no claim citations`,
        refs: [{ refType: "wiki_page", refId: p.id }],
      });
    }

    if (p.status === "draft" && daysSince(p.updatedAt) > 30) {
      issues.push({
        code: "stale_draft_page",
        severity: "info",
        message: `Draft page ${p.pageKey} is older than 30 days`,
        refs: [{ refType: "wiki_page", refId: p.id }],
      });
    }
  }

  const contradictEdges = input.graphRelations.filter(
    (g) => g.relationType === "contradicts" && g.sourceNodeType === "claim" && g.targetNodeType === "claim",
  );
  const claimById = new Map(input.claims.map((c) => [c.id, c]));
  for (const e of contradictEdges) {
    const a = claimById.get(e.sourceNodeId);
    const b = claimById.get(e.targetNodeId);
    if (!a || !b) continue;
    if (a.status === "candidate" && b.status === "candidate") {
      issues.push({
        code: "unresolved_contradiction",
        severity: "warn",
        message: `Claims ${a.id} and ${b.id} contradict but remain candidates`,
        refs: [
          { refType: "claim", refId: a.id },
          { refType: "claim", refId: b.id },
        ],
      });
    }
  }

  return issues;
}
