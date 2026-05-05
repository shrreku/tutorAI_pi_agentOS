import type { NormalizedDocumentNode, ParseResult } from "./document-model.js";
import { newChunkId } from "./ids.js";

export type ChunkInsert = {
  id: string;
  sourceVersionId: string;
  parentChunkId: string | null;
  chunkType: string;
  text: string;
  tokenCount: number | null;
  sourceSpanJson: Record<string, unknown> | null;
  pageStart: number | null;
  pageEnd: number | null;
  headingPath: string[];
  metadataJson: Record<string, unknown>;
};

function roughTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function splitOversizedParagraph(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const back = text.lastIndexOf("\n\n", end);
      const dot = text.lastIndexOf(". ", end);
      const cut = Math.max(back, dot);
      if (cut > start + maxChars * 0.5) end = cut + (text[cut] === "." ? 2 : 0);
    }
    parts.push(text.slice(start, end).trim());
    start = end;
  }
  return parts.filter(Boolean);
}

/**
 * Builds structural `structure` chunks for headings and `retrieval` chunks for
 * paragraph/code/callout bodies with parent links to the nearest heading chunk.
 */
export function documentTreeToChunks(
  parse: ParseResult,
  options: { sourceVersionId: string; maxChars?: number },
): ChunkInsert[] {
  const maxChars = options.maxChars ?? 2800;
  const nodes = parse.documentTree;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const headingChunkByNodeId = new Map<string, string>();

  const chunks: ChunkInsert[] = [];

  for (const node of nodes) {
    if (node.type !== "heading") continue;
    const hp = node.sourceSpan.headingPath ?? [];
    const title = node.text;
    const breadcrumb = [...hp, title].filter(Boolean).join(" › ");
    const cid = newChunkId();
    headingChunkByNodeId.set(node.id, cid);
    chunks.push({
      id: cid,
      sourceVersionId: options.sourceVersionId,
      parentChunkId: nearestHeadingChunkIdForNode(node, byId, headingChunkByNodeId),
      chunkType: "structure",
      text: breadcrumb,
      tokenCount: roughTokenCount(breadcrumb),
      sourceSpanJson: { ...node.sourceSpan } as Record<string, unknown>,
      pageStart: node.sourceSpan.pageStart ?? null,
      pageEnd: node.sourceSpan.pageEnd ?? null,
      headingPath: [...hp],
      metadataJson: { nodeId: node.id, nodeType: node.type, ...(node.metadata as object) },
    });
  }

  const bodyTypes = new Set<NormalizedDocumentNode["type"]>(["paragraph", "code_block", "callout", "list"]);

  for (const node of nodes) {
    if (!bodyTypes.has(node.type)) continue;
    const parentChunkId = nearestHeadingChunkIdForNode(node, byId, headingChunkByNodeId);
    const pieces = splitOversizedParagraph(node.text, maxChars);
    for (let pi = 0; pi < pieces.length; pi += 1) {
      const piece = pieces[pi]!;
      chunks.push({
        id: newChunkId(),
        sourceVersionId: options.sourceVersionId,
        parentChunkId,
        chunkType: "retrieval",
        text: piece,
        tokenCount: roughTokenCount(piece),
        sourceSpanJson: { ...node.sourceSpan, partIndex: pi, partCount: pieces.length } as Record<string, unknown>,
        pageStart: node.sourceSpan.pageStart ?? null,
        pageEnd: node.sourceSpan.pageEnd ?? null,
        headingPath: [...(node.sourceSpan.headingPath ?? [])],
        metadataJson: { nodeId: node.id, nodeType: node.type, ...(node.metadata as object) },
      });
    }
  }

  return chunks;
}

function nearestHeadingChunkIdForNode(
  node: NormalizedDocumentNode,
  byId: Map<string, NormalizedDocumentNode>,
  headingChunkByNodeId: Map<string, string>,
): string | null {
  let cur: string | undefined = node.parentId;
  while (cur) {
    const p = byId.get(cur);
    if (!p) break;
    if (p.type === "heading") {
      return headingChunkByNodeId.get(p.id) ?? null;
    }
    cur = p.parentId;
  }
  return null;
}
