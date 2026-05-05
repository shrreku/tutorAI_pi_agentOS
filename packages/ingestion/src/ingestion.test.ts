import { describe, expect, it } from "vitest";
import { documentTreeToChunks } from "./chunk-document.js";
import { parseMarkdownLikeText } from "./parsers/markdown-text-parser.js";

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
    expect(retrievals.every((chunk) => typeof chunk.sourceSpanJson?.charStart === "number")).toBe(true);
    expect(retrievals.every((chunk) => typeof chunk.sourceSpanJson?.charEnd === "number")).toBe(true);
  });
});
