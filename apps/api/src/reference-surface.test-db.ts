import {
  artifacts,
  claimConceptLinks,
  claims,
  concepts,
  curricula,
  curriculumModules,
  objectiveLists,
  chunks,
  objectives,
  sessionPlans,
  tutorSessions,
  tutorTurns,
  sources,
  sourceVersions,
  wikiPages,
} from "@studyagent/db";

export type FakeTableRows = {
  concepts?: unknown[];
  wikiPages?: unknown[];
  curricula?: unknown[];
  curriculumModules?: unknown[];
  objectiveLists?: unknown[];
  objectives?: unknown[];
  sessionPlans?: unknown[];
  tutorSessions?: unknown[];
  tutorTurns?: unknown[];
  artifacts?: unknown[];
  sources?: unknown[];
  claims?: unknown[];
  claimConceptLinks?: unknown[];
  chunks?: unknown[];
  sourceVersions?: unknown[];
};

export class ReferenceSurfaceFakeDb {
  constructor(
    private readonly rows: FakeTableRows,
    private readonly nodeId?: string,
  ) {}

  select(_selection?: unknown) {
    const db = this;
    return {
      from(table: unknown) {
        return {
          where(_condition: unknown) {
            const tableRows = db.tableRows(table);
            const chain = {
              limit(limitCount: number) {
                let resolved = tableRows;
                if (db.nodeId && limitCount === 1) {
                  resolved = tableRows.filter((row) => (row as { id?: string }).id === db.nodeId);
                }
                return Promise.resolve(resolved.slice(0, limitCount));
              },
              orderBy(_order: unknown) {
                return {
                  limit(limitCount: number) {
                    let resolved = tableRows;
                    if (db.nodeId && limitCount === 1) {
                      resolved = tableRows.filter((row) => (row as { id?: string }).id === db.nodeId);
                    }
                    return Promise.resolve(resolved.slice(0, limitCount));
                  },
                };
              },
              then<TResult1 = unknown[]>(
                onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult1 | PromiseLike<TResult1>) | null,
              ) {
                return Promise.resolve(tableRows).then(onfulfilled, onrejected);
              },
            };
            if (table === claimConceptLinks) {
              return Promise.resolve(db.rows.claimConceptLinks ?? []);
            }
            return chain;
          },
        };
      },
    };
  }

  private tableRows(table: unknown): unknown[] {
    if (table === concepts) return this.rows.concepts ?? [];
    if (table === wikiPages) return this.rows.wikiPages ?? [];
    if (table === curricula) return this.rows.curricula ?? [];
    if (table === curriculumModules) return this.rows.curriculumModules ?? [];
    if (table === objectiveLists) return this.rows.objectiveLists ?? [];
    if (table === objectives) return this.rows.objectives ?? [];
    if (table === sessionPlans) return this.rows.sessionPlans ?? [];
    if (table === tutorSessions) return this.rows.tutorSessions ?? [];
    if (table === tutorTurns) return this.rows.tutorTurns ?? [];
    if (table === artifacts) return this.rows.artifacts ?? [];
    if (table === sources) return this.rows.sources ?? [];
    if (table === claims) return this.rows.claims ?? [];
    if (table === chunks) return this.rows.chunks ?? [];
    if (table === sourceVersions) return this.rows.sourceVersions ?? [];
    return [];
  }
}
