import { beforeEach, describe, expect, it, vi } from "vitest";
import { agenticCacheEntries } from "@studyagent/db";
import type { UnifiedSearchResult } from "@studyagent/search";
import { createTutorReadToolProvider } from "./tutor-tool-provider.js";

const {
  lexicalSearchNotebookMock,
  hybridSearchNotebookMock,
  expandRetrievalChunksWithParentsMock,
} = vi.hoisted(() => ({
  lexicalSearchNotebookMock: vi.fn(),
  hybridSearchNotebookMock: vi.fn(),
  expandRetrievalChunksWithParentsMock: vi.fn(async (_db: unknown, rows: UnifiedSearchResult[]) => rows),
}));

vi.mock("@studyagent/search", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/search")>("@studyagent/search");
  return {
    ...actual,
    lexicalSearchNotebook: lexicalSearchNotebookMock,
    hybridSearchNotebook: hybridSearchNotebookMock,
    expandRetrievalChunksWithParents: expandRetrievalChunksWithParentsMock,
  };
});

function createCacheAwareDb() {
  const cacheEntries = new Map<string, Record<string, unknown>>();
  return {
    db: {
      execute: vi.fn(async () => [
        {
          material_updated_at: new Date("2026-06-05T00:00:00.000Z"),
          chunk_fingerprint: "1:chunks_v1",
        },
      ]),
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: () => {
              if (table === agenticCacheEntries) {
                return Promise.resolve([...cacheEntries.values()].slice(0, 1));
              }
              return Promise.resolve([]);
            },
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async () => {
            if (table === agenticCacheEntries && typeof values.cacheKey === "string") {
              cacheEntries.set(values.cacheKey, values);
            }
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            if (table !== agenticCacheEntries) return;
            const [cacheKey] = cacheEntries.keys();
            if (!cacheKey) return;
            cacheEntries.set(cacheKey, { ...cacheEntries.get(cacheKey), ...values });
          },
        }),
      }),
      delete: () => ({
        where: async () => {},
      }),
    },
    cacheEntries,
  };
}

describe("wiki.search retrieval cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    lexicalSearchNotebookMock.mockReset();
    hybridSearchNotebookMock.mockReset();
    expandRetrievalChunksWithParentsMock.mockClear();
  });

  it("reuses expanded retrieval rows for identical material version and query inputs", async () => {
    const row = {
      id: "chunk_1",
      type: "chunk",
      title: "Chunk",
      snippet: "Cached retrieval text",
      score: 1,
      scoreDetails: { lexical: 1 },
      provenance: [{ refType: "chunk", refId: "chunk_1", role: "derived_from" }],
      sourceId: "src_1",
    } satisfies UnifiedSearchResult & { sourceId: string };
    lexicalSearchNotebookMock.mockResolvedValue([row]);
    const db = createCacheAwareDb();
    const ctx = {
      db,
      env: {
        OPENROUTER_API_KEY: "",
        OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
        EMBEDDING_MODEL: "gemini-embedding-2",
        DEFAULT_EXTRACTION_MODEL: "openrouter/auto",
      },
    } as never;
    const provider = createTutorReadToolProvider(ctx);
    const toolCtx = {
      notebookId: "nb_1",
      selectedNodeRefs: [],
    } as never;

    const searchInput = {
      query: "teach entropy",
      maxResults: 2,
      selectedNodeRefs: [],
      conceptIds: [],
      includeGraphExpansion: false,
    };
    const first = await provider.wikiSearch(searchInput, toolCtx);
    const second = await provider.wikiSearch(searchInput, toolCtx);

    expect(first.results.map((item) => item.refId)).toEqual(["chunk_1"]);
    expect(second.results.map((item) => item.refId)).toEqual(["chunk_1"]);
    expect(lexicalSearchNotebookMock).toHaveBeenCalledTimes(1);
    expect(expandRetrievalChunksWithParentsMock).toHaveBeenCalledTimes(1);
    expect(db.cacheEntries.size).toBe(1);
  });

  it("falls back to lexical retrieval when hybrid embedding search fails", async () => {
    const row = {
      id: "chunk_lexical",
      type: "chunk",
      title: "Chunk",
      snippet: "Lexical fallback text",
      score: 1,
      scoreDetails: { lexical: 1 },
      provenance: [{ refType: "chunk", refId: "chunk_lexical", role: "derived_from" }],
      sourceId: "src_1",
    } satisfies UnifiedSearchResult & { sourceId: string };
    hybridSearchNotebookMock.mockRejectedValue(new Error("fetch failed"));
    lexicalSearchNotebookMock.mockResolvedValue([row]);
    const db = createCacheAwareDb();
    const ctx = {
      db,
      env: {
        OPENROUTER_API_KEY: "openrouter-key",
        OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
        EMBEDDING_MODEL: "gemini-embedding-2",
        DEFAULT_EXTRACTION_MODEL: "openrouter/auto",
      },
    } as never;
    const provider = createTutorReadToolProvider(ctx);

    const result = (await provider.wikiSearch(
      { query: "teach entropy", maxResults: 2, selectedNodeRefs: [], conceptIds: [], includeGraphExpansion: false },
      { notebookId: "nb_1", selectedNodeRefs: [] } as never,
    )) as { results: Array<{ refId: string }>; retrievalMode?: string; fallbackReason?: string; warnings?: Array<{ code: string }> };

    expect(result.results.map((item) => item.refId)).toEqual(["chunk_lexical"]);
    expect(result.retrievalMode).toBe("lexical_fallback");
    expect(result.fallbackReason).toBeTruthy();
    expect(result.warnings?.map((warning) => warning.code)).toContain("hybrid_retrieval_fallback");
    expect(hybridSearchNotebookMock).toHaveBeenCalledTimes(1);
    expect(lexicalSearchNotebookMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to lexical retrieval before a hanging hybrid search can time out the tool", async () => {
    const row = {
      id: "chunk_timeout_fallback",
      type: "chunk",
      title: "Chunk",
      snippet: "Timeout fallback text",
      score: 1,
      scoreDetails: { lexical: 1 },
      provenance: [{ refType: "chunk", refId: "chunk_timeout_fallback", role: "derived_from" }],
      sourceId: "src_1",
    } satisfies UnifiedSearchResult & { sourceId: string };
    hybridSearchNotebookMock.mockImplementation(() => new Promise(() => {}));
    lexicalSearchNotebookMock.mockResolvedValue([row]);
    const db = createCacheAwareDb();
    const ctx = {
      db,
      env: {
        OPENROUTER_API_KEY: "openrouter-key",
        OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
        EMBEDDING_MODEL: "gemini-embedding-2",
        DEFAULT_EXTRACTION_MODEL: "openrouter/auto",
      },
    } as never;
    const provider = createTutorReadToolProvider(ctx);

    const result = (await provider.wikiSearch(
      { query: "teach entropy", maxResults: 2, selectedNodeRefs: [], conceptIds: [], includeGraphExpansion: false },
      { notebookId: "nb_1", selectedNodeRefs: [] } as never,
    )) as { results: Array<{ refId: string }>; retrievalMode?: string };

    expect(result.results.map((item) => item.refId)).toEqual(["chunk_timeout_fallback"]);
    expect(result.retrievalMode).toBe("lexical_fallback");
    expect(hybridSearchNotebookMock).toHaveBeenCalledTimes(1);
    expect(lexicalSearchNotebookMock).toHaveBeenCalledTimes(1);
  }, 8000);

  it("warns when a requested source section is not present in returned rows", async () => {
    const row = {
      id: "chunk_221",
      type: "chunk",
      title: "2.2.1 Thermal Conductivity",
      snippet: "Thermal conductivity depends on electrons and phonons.",
      score: 1,
      scoreDetails: { lexical: 1 },
      provenance: [{ refType: "chunk", refId: "chunk_221", role: "derived_from" }],
      sourceId: "src_1",
    } satisfies UnifiedSearchResult & { sourceId: string };
    lexicalSearchNotebookMock.mockResolvedValue([row]);
    const db = createCacheAwareDb();
    const ctx = {
      db,
      env: {
        OPENROUTER_API_KEY: "",
        OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
        EMBEDDING_MODEL: "gemini-embedding-2",
        DEFAULT_EXTRACTION_MODEL: "openrouter/auto",
      },
    } as never;
    const provider = createTutorReadToolProvider(ctx);

    const result = (await provider.wikiSearch(
      { query: "Section 2.2.2 temperature dependence of k", maxResults: 2, selectedNodeRefs: [], conceptIds: [], includeGraphExpansion: false },
      { notebookId: "nb_1", selectedNodeRefs: [] } as never,
    )) as { warnings?: Array<{ code: string; message: string }> };

    expect(result.warnings?.map((warning) => warning.code)).toContain("requested_section_not_found");
    expect(result.warnings?.find((warning) => warning.code === "requested_section_not_found")?.message).toContain("2.2.2");
  });
});
