import { afterEach, describe, expect, it, vi } from "vitest";
import { documentTreeToChunks } from "./chunk-document.js";
import { llamaParsePdfToMarkdown } from "./parsers/llamaparse-client.js";
import { parseMarkdownLikeText } from "./parsers/markdown-text-parser.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ingestion", () => {
  it("parses markdown headings and paragraphs with spans", () => {
    const md = "# Title\n\nHello **world**.\n\n## Sub\n\nMore text.\n";
    const bytes = new TextEncoder().encode(md);
    const parsed = parseMarkdownLikeText(bytes, {
      sourceId: "src_1",
      sourceVersionId: "sv_1",
      label: "markdown",
    });

    expect(parsed.parser.name).toBe("markdown_text");
    const headings = parsed.documentTree.filter((n) => n.type === "heading");
    const paras = parsed.documentTree.filter((n) => n.type === "paragraph");
    expect(headings.map((h) => h.text)).toEqual(["Title", "Sub"]);
    expect(paras.map((p) => p.text)).toEqual(["Hello **world**.", "More text."]);
    expect(paras[0]!.sourceSpan.charStart).toBeGreaterThanOrEqual(0);
    expect(paras[0]!.sourceSpan.charEnd).toBeGreaterThan(paras[0]!.sourceSpan.charStart!);
  });

  it("chunks paragraphs under nearest heading structure parent", () => {
    const md = "# A\n\nP1\n\n## B\n\nP2\n";
    const bytes = new TextEncoder().encode(md);
    const parsed = parseMarkdownLikeText(bytes, {
      sourceId: "src_1",
      sourceVersionId: "sv_1",
      label: "markdown",
    });
    const chunks = documentTreeToChunks(parsed, { sourceVersionId: "sv_1" });
    const structures = chunks.filter((c) => c.chunkType === "structure");
    const retrievals = chunks.filter((c) => c.chunkType === "retrieval");
    expect(structures.map((c) => c.text)).toEqual(["A", "A › B"]);
    expect(retrievals.map((c) => c.text)).toEqual(["P1", "P2"]);
    const p2 = retrievals.find((c) => c.text === "P2");
    const bHeading = structures.find((c) => c.text === "A › B");
    expect(p2?.parentChunkId).toBe(bHeading?.id);
  });

  it("preserves list, table, and equation blocks as retrieval chunks with heading context", () => {
    const md = [
      "# Foundations",
      "",
      "- vectors",
      "- matrices",
      "",
      "| term | meaning |",
      "| --- | --- |",
      "| norm | length |",
      "",
      "F = ma",
      "",
    ].join("\n");
    const bytes = new TextEncoder().encode(md);
    const parsed = parseMarkdownLikeText(bytes, {
      sourceId: "src_1",
      sourceVersionId: "sv_1",
      label: "markdown",
    });

    const chunks = documentTreeToChunks(parsed, { sourceVersionId: "sv_1" });
    const retrievals = chunks.filter((c) => c.chunkType === "retrieval");
    const structure = chunks.find((c) => c.chunkType === "structure" && c.text === "Foundations");

    expect(retrievals).toHaveLength(3);
    expect(retrievals.map((chunk) => chunk.text)).toEqual([
      "- vectors\n- matrices",
      "| term | meaning |\n| --- | --- |\n| norm | length |",
      "F = ma",
    ]);
    expect(retrievals.every((chunk) => chunk.parentChunkId === structure?.id)).toBe(true);
    expect(retrievals.every((chunk) => chunk.headingPath.join(" / ") === "Foundations")).toBe(true);
    expect(retrievals.every((chunk) => typeof chunk.sourceSpanJson?.charStart === "number")).toBe(
      true,
    );
    expect(retrievals.every((chunk) => typeof chunk.sourceSpanJson?.charEnd === "number")).toBe(
      true,
    );
  });

  it("retries transient LlamaCloud upload failures before creating the parse job", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{}", { status: 499, headers: { "content-type": "application/json" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "file_1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job: { id: "job_1", status: "PENDING" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job: { status: "COMPLETED" }, markdown_full: "# Parsed" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = await llamaParsePdfToMarkdown(
      new TextEncoder().encode("%PDF-1.7"),
      "Chapter 2.pdf",
      {
        apiKey: "test-key",
        baseUrl: "https://llamacloud.test",
        tier: "cost_effective",
        pollMs: 0,
        maxWaitMs: 1000,
        requestAttempts: 2,
        requestRetryBaseMs: 0,
      },
    );

    expect(parsed).toMatchObject({ jobId: "job_1", markdown: "# Parsed" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://llamacloud.test/api/v1/beta/files");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://llamacloud.test/api/v1/beta/files");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("https://llamacloud.test/api/v2/parse");
  });
});
