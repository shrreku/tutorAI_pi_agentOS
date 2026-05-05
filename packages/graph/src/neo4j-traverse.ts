import { int, isInt, isPath, Node, type Path, type Session } from "neo4j-driver";

function plainProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (isInt(v)) {
      const n = v.toNumber();
      out[k] = Number.isSafeInteger(n) ? n : v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function nodeSummary(n: unknown): { id: string; labels: string[]; props: Record<string, unknown> } | null {
  if (!(n instanceof Node)) return null;
  const props = plainProps(n.properties as Record<string, unknown>);
  const id = typeof props.id === "string" ? props.id : props.id != null ? String(props.id) : "";
  if (!id) return null;
  return { id, labels: [...n.labels], props };
}

export type ConceptNeighborhood = {
  center: { id: string; name: string } | null;
  prerequisites: Array<{ id: string; name: string }>;
  examples: Array<{ id: string; name: string }>;
  contradicts: Array<{ id: string; name: string }>;
  wikiPages: Array<{ id: string; title: string }>;
  artifacts: Array<{ id: string; title: string }>;
  edges: Array<{ type: string; startId: string; endId: string }>;
};

/** Prerequisites, examples, contradictions, and wiki pages around one concept (GF-0302). */
export async function queryConceptNeighborhood(
  session: Session,
  notebookId: string,
  conceptId: string,
  limit: number,
): Promise<ConceptNeighborhood> {
  const res = await session.run(
    `MATCH (c:Concept {id: $conceptId, notebookId: $notebookId})
     OPTIONAL MATCH (pre:Concept {notebookId: $notebookId})-[:DEPENDS_ON]->(c)
     OPTIONAL MATCH (ex:Concept {notebookId: $notebookId})-[:DERIVED_FROM]->(c)
     OPTIONAL MATCH (co:Concept {notebookId: $notebookId})-[:CONTRADICTS]-(c)
     OPTIONAL MATCH (wp:WikiPage {notebookId: $notebookId})-[:COVERS]->(c)
     OPTIONAL MATCH (a:Artifact {notebookId: $notebookId})-[:DERIVED_FROM|CITES]->(c)
     RETURN c AS center,
            collect(DISTINCT pre) AS prerequisites,
            collect(DISTINCT ex) AS examples,
            collect(DISTINCT co) AS contradicts,
            collect(DISTINCT wp) AS wikiPages,
            collect(DISTINCT a) AS artifacts
     LIMIT $limit`,
    { conceptId, notebookId, limit: int(limit) },
  );

  const empty: ConceptNeighborhood = {
    center: null,
    prerequisites: [],
    examples: [],
    contradicts: [],
    wikiPages: [],
    artifacts: [],
    edges: [],
  };

  const rec = res.records[0];
  if (!rec) return empty;

  const centerN = nodeSummary(rec.get("center"));
  const center =
    centerN && typeof centerN.props.name === "string"
      ? { id: centerN.id, name: centerN.props.name as string }
      : centerN
        ? { id: centerN.id, name: String(centerN.props.name ?? centerN.id) }
        : null;

  const collectNames = (raw: unknown): Array<{ id: string; name: string }> => {
    const list = Array.isArray(raw) ? raw : [];
    const out: Array<{ id: string; name: string }> = [];
    for (const n of list) {
      if (n == null) continue;
      const s = nodeSummary(n);
      if (!s) continue;
      out.push({ id: s.id, name: String(s.props.name ?? s.props.title ?? s.id) });
    }
    return out;
  };

  const collectWiki = (raw: unknown): Array<{ id: string; title: string }> => {
    const list = Array.isArray(raw) ? raw : [];
    const out: Array<{ id: string; title: string }> = [];
    for (const n of list) {
      if (n == null) continue;
      const s = nodeSummary(n);
      if (!s) continue;
      out.push({ id: s.id, title: String(s.props.title ?? s.id) });
    }
    return out;
  };

  const collectArtifacts = (raw: unknown): Array<{ id: string; title: string }> => {
    const list = Array.isArray(raw) ? raw : [];
    const out: Array<{ id: string; title: string }> = [];
    for (const n of list) {
      if (n == null) continue;
      const s = nodeSummary(n);
      if (!s) continue;
      out.push({ id: s.id, title: String(s.props.title ?? s.id) });
    }
    return out;
  };

  const prerequisites = collectNames(rec.get("prerequisites"));
  const examples = collectNames(rec.get("examples"));
  const contradicts = collectNames(rec.get("contradicts"));
  const wikiPages = collectWiki(rec.get("wikiPages"));
  const artifacts = collectArtifacts(rec.get("artifacts"));

  const edges: Array<{ type: string; startId: string; endId: string }> = [];
  if (center) {
    for (const p of prerequisites) {
      edges.push({ type: "DEPENDS_ON", startId: p.id, endId: center.id });
    }
    for (const e of examples) {
      edges.push({ type: "DERIVED_FROM", startId: e.id, endId: center.id });
    }
    for (const c of contradicts) {
      edges.push({ type: "CONTRADICTS", startId: c.id, endId: center.id });
    }
    for (const w of wikiPages) {
      edges.push({ type: "COVERS", startId: w.id, endId: center.id });
    }
    for (const a of artifacts) {
      edges.push({ type: "DERIVED_FROM", startId: a.id, endId: center.id });
    }
  }

  return {
    center,
    prerequisites,
    examples,
    contradicts,
    wikiPages,
    artifacts,
    edges,
  };
}

export type ConceptPathResult = {
  found: boolean;
  nodeIds: string[];
  relTypes: string[];
};

/** Shortest path between two concepts over typed learning edges (GF-0302 path output). */
export async function queryConceptShortestPath(
  session: Session,
  notebookId: string,
  fromConceptId: string,
  toConceptId: string,
  maxHops: number,
): Promise<ConceptPathResult> {
  if (fromConceptId === toConceptId) {
    return { found: true, nodeIds: [fromConceptId], relTypes: [] };
  }
  const mh = Math.min(Math.max(maxHops, 1), 12);
  const res = await session.run(
    `MATCH (a:Concept {id: $fromId, notebookId: $notebookId}),
           (b:Concept {id: $toId, notebookId: $notebookId})
     OPTIONAL MATCH p = shortestPath((a)-[*..${mh}]-(b))
     WHERE p IS NULL OR ALL(r IN relationships(p) WHERE type(r) IN ['DEPENDS_ON','COVERS','CONTRADICTS','DERIVED_FROM','CITES'])
     RETURN p`,
    { fromId: fromConceptId, toId: toConceptId, notebookId },
  );

  const rec = res.records[0];
  if (!rec) {
    return { found: false, nodeIds: [], relTypes: [] };
  }
  const pRaw = rec.get("p");
  if (pRaw == null || !isPath(pRaw)) {
    return { found: false, nodeIds: [], relTypes: [] };
  }
  const p = pRaw as Path;
  if (!p.segments.length) {
    return { found: false, nodeIds: [], relTypes: [] };
  }
  const idFromNode = (n: Node) => {
    const props = plainProps(n.properties as Record<string, unknown>);
    return typeof props.id === "string" ? props.id : String(props.id ?? "");
  };
  const nodeIds: string[] = [idFromNode(p.segments[0]!.start)];
  const relTypes: string[] = [];
  for (const seg of p.segments) {
    relTypes.push(seg.relationship.type);
    nodeIds.push(idFromNode(seg.end));
  }
  return { found: true, nodeIds, relTypes };
}
