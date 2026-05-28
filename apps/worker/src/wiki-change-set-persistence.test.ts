import { describe, expect, it } from "vitest";
import {
  claimConceptLinks,
  claims,
  concepts,
  events,
  graphRelations,
  wikiPages,
} from "@studyagent/db";
import type { WikiChangeSet } from "@studyagent/wiki-core";
import { applyWikiChangeSet } from "./wiki-change-set-persistence.js";

type Row = Record<string, unknown>;

function makeChangeSet(): WikiChangeSet {
  return {
    notebookId: "nb_commit",
    sourceId: "src_commit",
    sourceVersionId: "sv_commit",
    sourceTitle: "Commit Source",
    compiledAt: "2026-05-28T10:00:00.000Z",
    fingerprint: "fp_commit",
    concepts: [
      {
        action: "create",
        id: "cnc_commit",
        canonicalName: "Voltage",
        aliases: [],
        conceptType: "concept",
      },
    ],
    claims: [
      {
        id: "clm_commit",
        claimType: "fact",
        claimText: "Voltage drives current.",
        conceptIds: ["cnc_commit"],
        status: "published",
        confidence: 0.8,
        qualityScore: 0.7,
        supportScore: 0.7,
        confidenceComponents: {
          sourceSupport: 0.8,
          extractionConfidence: 0.8,
          recency: 1,
          contradictionPenalty: 0,
          humanApproval: 0,
          reinforcementSignal: 0,
        },
        evidenceChunkIds: ["chk_commit"],
        conceptLinks: [{ conceptId: "cnc_commit", role: "about", confidence: 0.8 }],
        resolution: { kind: "active", reason: "test fixture" },
        evidenceRefs: [{ kind: "source_chunk", chunkId: "chk_commit" }],
      },
    ],
    claimPatches: [],
    graphRelations: [
      {
        id: "rel_commit",
        sourceNodeType: "concept",
        sourceNodeId: "cnc_commit",
        targetNodeType: "concept",
        targetNodeId: "cnc_commit",
        relationType: "supports",
        confidence: 0.8,
        sourceClaimIds: ["clm_commit"],
        sourceChunkIds: ["chk_commit"],
        metadataJson: { ingestionSourceId: "src_commit" },
      },
    ],
    wikiPages: [
      {
        id: "wp_commit",
        pageType: "source_summary",
        pageKey: "source:src_commit",
        title: "Source",
        markdown: "## Source",
        blocks: [],
        sourceClaimIds: ["clm_commit"],
        sourceChunkIds: ["chk_commit"],
        structuredJson: {},
        confidenceSummaryJson: {},
        qualityScore: 0.7,
      },
    ],
    deleteWikiPageKeys: [],
    deleteClaimsForSource: true,
    deleteGraphRelationsForSource: true,
    warnings: [],
    events: [{ eventType: "wiki.page.compiled", payload: { pageId: "wp_commit" } }],
  };
}

function createFakeDb(options: { failEventInsert?: boolean } = {}) {
  const state = new Map<unknown, Row[]>([
    [concepts, []],
    [claims, []],
    [claimConceptLinks, []],
    [graphRelations, []],
    [wikiPages, []],
    [events, []],
  ]);

  const makeTx = (target: Map<unknown, Row[]>) => ({
    execute: async () => undefined,
    select: (fields?: Row) => ({
      from: (table: unknown) => ({
        where: () => {
          const rowsForTable = () => {
            if (table === events) {
              const eventRows = target.get(events)!;
              const committed = eventRows.filter((row) => row.eventType === "wiki.change_set.committed" && (row.payloadJson as Row)?.fingerprint === "fp_commit");
              if (fields && "id" in fields) return committed;
              const maxSeq = eventRows.reduce((max, row) => Math.max(max, Number(row.sequenceNo ?? 0)), 0);
              return [{ m: maxSeq }];
            }
            return target.get(table) ?? [];
          };
          return {
            limit: async () => rowsForTable(),
            then: (resolve: (value: Row[]) => void) => resolve(rowsForTable()),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: Row) => {
        if (table === events && options.failEventInsert) {
          throw new Error("event insert failed");
        }
        target.get(table)!.push(value);
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        target.set(table, []);
      },
    }),
    update: (table: unknown) => ({
      set: (value: Row) => ({
        where: async () => {
          Object.assign(target.get(table)![0] ?? {}, value);
        },
      }),
    }),
  });

  return {
    db: {
      transaction: async <T>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>): Promise<T> => {
        const clone = new Map([...state.entries()].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
        const result = await fn(makeTx(clone));
        state.clear();
        for (const entry of clone.entries()) state.set(entry[0], entry[1]);
        return result;
      },
    },
    state,
  };
}

describe("Knowledge Commit", () => {
  it("rolls back wiki rows when event append fails after wiki pages are written", async () => {
    const fake = createFakeDb({ failEventInsert: true });
    await expect(applyWikiChangeSet(fake as never, { changeSet: makeChangeSet() })).rejects.toThrow("event insert failed");
    expect(fake.state.get(wikiPages)).toEqual([]);
    expect(fake.state.get(claims)).toEqual([]);
  });

  it("skips a retry when the same change-set fingerprint is already committed", async () => {
    const fake = createFakeDb();
    const first = await applyWikiChangeSet(fake as never, { changeSet: makeChangeSet() });
    const second = await applyWikiChangeSet(fake as never, { changeSet: makeChangeSet() });
    expect(first.alreadyCommitted).toBe(false);
    expect(second.alreadyCommitted).toBe(true);
    expect(fake.state.get(wikiPages)).toHaveLength(1);
    expect(fake.state.get(events)?.filter((row) => row.eventType === "wiki.change_set.committed")).toHaveLength(1);
  });
});
