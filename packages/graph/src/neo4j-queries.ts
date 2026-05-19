import { Node, Relationship, int, isInt, type Session } from "neo4j-driver";

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

function serializeNode(raw: unknown): { id: string; labels: string[]; props: Record<string, unknown> } | null {
  if (!(raw instanceof Node)) {
    return null;
  }
  const props = plainProps(raw.properties as Record<string, unknown>);
  const id = typeof props.id === "string" ? props.id : props.id != null ? String(props.id) : "";
  if (!id) {
    return null;
  }
  return { id, labels: [...raw.labels], props };
}

function pushEdge(
  edges: Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }>,
  rel: Relationship,
  startId: string,
  endId: string,
): void {
  edges.push({
    type: rel.type,
    startId,
    endId,
    props: plainProps(rel.properties as Record<string, unknown>),
  });
}

function dedupeEdges(
  edges: Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }>,
): Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }> {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.startId}\u0000${edge.type}\u0000${edge.endId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Study map: sources → curricula → modules → objective lists → session plans (+ study plan coverage when present). */
export async function queryStudyMapSimple(
  session: Session,
  notebookId: string,
  limit: number,
): Promise<{
  nodes: Array<{ id: string; labels: string[]; props: Record<string, unknown> }>;
  edges: Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }>;
}> {
  const res = await session.run(
    `MATCH (s:Source {notebookId: $notebookId})
     OPTIONAL MATCH (s)-[r1:COVERS]->(cur:Curriculum {notebookId: $notebookId})
     OPTIONAL MATCH (cur)-[r2:CONTAINS]->(m:curriculum_module {notebookId: $notebookId})
     OPTIONAL MATCH (m)-[r3:CONTAINS]->(ol:objective_list {notebookId: $notebookId})
     OPTIONAL MATCH (ol)-[r4:PLANS]->(sp:session_plan {notebookId: $notebookId})
     OPTIONAL MATCH (cur)-[r5:CONTAINS]->(o:Objective {notebookId: $notebookId})
     OPTIONAL MATCH (o)-[r6:NEXT_OBJECTIVE]->(o2:Objective {notebookId: $notebookId})
     OPTIONAL MATCH (plan:StudyPlan {notebookId: $notebookId})-[r7:COVERS]->(oc:Objective {notebookId: $notebookId})
     RETURN s, r1, cur, r2, m, r3, ol, r4, sp, r5, o, r6, o2, plan, r7, oc
     LIMIT $limit`,
    { notebookId, limit: int(limit) },
  );

  const nodeById = new Map<string, { id: string; labels: string[]; props: Record<string, unknown> }>();
  const edges: Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }> = [];

  const addNode = (raw: unknown) => {
    const n = serializeNode(raw);
    if (n) {
      nodeById.set(n.id, n);
    }
  };

  for (const rec of res.records) {
    const s = rec.get("s");
    const cur = rec.get("cur");
    const m = rec.get("m");
    const ol = rec.get("ol");
    const sp = rec.get("sp");
    const o = rec.get("o");
    const o2 = rec.get("o2");
    const plan = rec.get("plan");
    const oc = rec.get("oc");
    const r1 = rec.get("r1");
    const r2 = rec.get("r2");
    const r3 = rec.get("r3");
    const r4 = rec.get("r4");
    const r5 = rec.get("r5");
    const r6 = rec.get("r6");
    const r7 = rec.get("r7");

    addNode(s);
    addNode(cur);
    addNode(m);
    addNode(ol);
    addNode(sp);
    addNode(o);
    addNode(o2);
    addNode(plan);
    addNode(oc);

    const sn = serializeNode(s);
    const curN = serializeNode(cur);
    const mN = serializeNode(m);
    const olN = serializeNode(ol);
    const spN = serializeNode(sp);
    const oN = serializeNode(o);
    const o2N = serializeNode(o2);
    const planN = serializeNode(plan);
    const ocN = serializeNode(oc);

    if (r1 instanceof Relationship && sn && curN) {
      pushEdge(edges, r1, sn.id, curN.id);
    }
    if (r2 instanceof Relationship && curN && mN) {
      pushEdge(edges, r2, curN.id, mN.id);
    }
    if (r3 instanceof Relationship && mN && olN) {
      pushEdge(edges, r3, mN.id, olN.id);
    }
    if (r4 instanceof Relationship && olN && spN) {
      pushEdge(edges, r4, olN.id, spN.id);
    }
    if (r5 instanceof Relationship && curN && oN) {
      pushEdge(edges, r5, curN.id, oN.id);
    }
    if (r6 instanceof Relationship && oN && o2N) {
      pushEdge(edges, r6, oN.id, o2N.id);
    }
    if (r7 instanceof Relationship && planN && ocN) {
      pushEdge(edges, r7, planN.id, ocN.id);
    }
  }

  return { nodes: [...nodeById.values()], edges: dedupeEdges(edges) };
}

/** Source wiki map: source-linked wiki pages, concepts, and concept–concept edges. */
export async function querySourceWikiMapSimple(
  session: Session,
  notebookId: string,
  sourceId: string,
  limit: number,
): Promise<{
  nodes: Array<{ id: string; labels: string[]; props: Record<string, unknown> }>;
  edges: Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }>;
}> {
  const res = await session.run(
    `MATCH (source:Source {id: $sourceId, notebookId: $notebookId})
     OPTIONAL MATCH (source)-[rst:HAS_TOPIC]->(topic:Topic {notebookId: $notebookId})
     OPTIONAL MATCH (topic)-[rtc:CONTAINS_CONCEPT]->(tc:Concept {notebookId: $notebookId})
     OPTIONAL MATCH (topic)-[rtp:CONTAINS_PAGE]->(twp:WikiPage {notebookId: $notebookId})
     OPTIONAL MATCH (wp:WikiPage {notebookId: $notebookId})-[:DERIVED_FROM]->(source)
     OPTIONAL MATCH (wp)-[rwc:COVERS]->(c:Concept {notebookId: $notebookId})
     OPTIONAL MATCH (source)<-[rds:DERIVED_FROM]-(claim:Claim {notebookId: $notebookId})
     OPTIONAL MATCH (claim)-[rcc:CITES]->(claimConcept:Concept {notebookId: $notebookId})
     OPTIONAL MATCH (claimConcept)<-[rpc:COVERS]-(conceptPage:WikiPage {notebookId: $notebookId})
     OPTIONAL MATCH (c)-[rc:DEPENDS_ON|CONTRADICTS|COVERS|DERIVED_FROM]->(c2:Concept {notebookId: $notebookId})
     OPTIONAL MATCH (claimConcept)-[rcc2:DEPENDS_ON|CONTRADICTS|COVERS|DERIVED_FROM]->(claimConcept2:Concept {notebookId: $notebookId})
     RETURN source, rst, topic, rtc, tc, rtp, twp, wp, rwc, c, rds, claim, rcc, claimConcept, rpc, conceptPage, rc, c2, rcc2, claimConcept2
     LIMIT $limit`,
    { notebookId, sourceId, limit: int(limit) },
  );

  const nodeById = new Map<string, { id: string; labels: string[]; props: Record<string, unknown> }>();
  const edges: Array<{ type: string; startId: string; endId: string; props: Record<string, unknown> }> = [];

  const addNode = (raw: unknown) => {
    const n = serializeNode(raw);
    if (n) {
      nodeById.set(n.id, n);
    }
  };

  for (const rec of res.records) {
    const source = rec.get("source");
    const topic = rec.get("topic");
    const tc = rec.get("tc");
    const twp = rec.get("twp");
    const wp = rec.get("wp");
    const c = rec.get("c");
    const claim = rec.get("claim");
    const claimConcept = rec.get("claimConcept");
    const conceptPage = rec.get("conceptPage");
    const c2 = rec.get("c2");
    const claimConcept2 = rec.get("claimConcept2");
    const rst = rec.get("rst");
    const rtc = rec.get("rtc");
    const rtp = rec.get("rtp");
    const rwc = rec.get("rwc");
    const rds = rec.get("rds");
    const rcc = rec.get("rcc");
    const rpc = rec.get("rpc");
    const rc = rec.get("rc");
    const rcc2 = rec.get("rcc2");

    addNode(source);
    addNode(topic);
    addNode(tc);
    addNode(twp);
    addNode(wp);
    addNode(c);
    addNode(claim);
    addNode(claimConcept);
    addNode(conceptPage);
    addNode(c2);
    addNode(claimConcept2);

    const sourceN = serializeNode(source);
    const topicN = serializeNode(topic);
    const tcN = serializeNode(tc);
    const twpN = serializeNode(twp);
    const wpN = serializeNode(wp);
    const cN = serializeNode(c);
    const claimN = serializeNode(claim);
    const claimConceptN = serializeNode(claimConcept);
    const conceptPageN = serializeNode(conceptPage);
    const c2N = serializeNode(c2);
    const claimConcept2N = serializeNode(claimConcept2);

    if (rst instanceof Relationship && sourceN && topicN) {
      pushEdge(edges, rst, sourceN.id, topicN.id);
    }
    if (rtc instanceof Relationship && topicN && tcN) {
      pushEdge(edges, rtc, topicN.id, tcN.id);
    }
    if (rtp instanceof Relationship && topicN && twpN) {
      pushEdge(edges, rtp, topicN.id, twpN.id);
    }
    if (rwc instanceof Relationship && wpN && cN) {
      pushEdge(edges, rwc, wpN.id, cN.id);
    }
    if (rds instanceof Relationship && claimN && sourceN) {
      pushEdge(edges, rds, claimN.id, sourceN.id);
    }
    if (rcc instanceof Relationship && claimN && claimConceptN) {
      pushEdge(edges, rcc, claimN.id, claimConceptN.id);
    }
    if (rpc instanceof Relationship && conceptPageN && claimConceptN) {
      pushEdge(edges, rpc, conceptPageN.id, claimConceptN.id);
    }
    if (rc instanceof Relationship && cN && c2N) {
      pushEdge(edges, rc, cN.id, c2N.id);
    }
    if (rcc2 instanceof Relationship && claimConceptN && claimConcept2N) {
      pushEdge(edges, rcc2, claimConceptN.id, claimConcept2N.id);
    }
  }

  return { nodes: [...nodeById.values()], edges: dedupeEdges(edges) };
}
