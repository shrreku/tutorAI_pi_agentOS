import type { SourceSpan } from "@studyagent/schemas";
import type { NormalizedDocumentNode, ParseResult, ParserAdapter } from "../document-model.js";
import { newNodeId } from "../ids.js";

function span(sourceId: string, sourceVersionId: string, start: number, end: number, headingPath: string[]): SourceSpan {
  return {
    sourceId,
    sourceVersionId,
    charStart: start,
    charEnd: end,
    headingPath,
  };
}

/**
 * Deterministic markdown-ish parser: ATX headings, paragraphs, fenced code blocks.
 * Line endings normalized to \n for span math before parsing body.
 */
export function parseMarkdownLikeText(
  bytes: Uint8Array,
  options: {
    sourceId: string;
    sourceVersionId: string;
    label: "markdown" | "text" | "html";
  },
): ParseResult {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const raw = decoder.decode(bytes);
  const text = raw.replace(/\r\n/g, "\n");

  const { sourceId, sourceVersionId, label } = options;
  const nodes: NormalizedDocumentNode[] = [];
  const warnings: string[] = [];

  const docId = newNodeId();
  nodes.push({
    id: docId,
    type: "document",
    text: "",
    sourceSpan: span(sourceId, sourceVersionId, 0, text.length, []),
    metadata: { kind: label },
  });

  const lines = splitLinesWithOffsets(text);
  let i = 0;
  const headingStack: { id: string; level: number; title: string }[] = [];

  const currentHeadingPath = (): string[] => headingStack.map((h) => h.title);

  while (i < lines.length) {
    const { line, start, end } = lines[i]!;

    const fence = line.match(/^(\s*)(```)([^`]*)\s*$/);
    if (fence) {
      const indent = fence[1] ?? "";
      const lang = (fence[3] ?? "").trim();
      const blockStart = start;
      i += 1;
      const bodyLines: typeof lines = [];
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!.line)) {
        bodyLines.push(lines[i]!);
        i += 1;
      }
      const blockEnd = i < lines.length ? lines[i]!.end : text.length;
      const bodyText = bodyLines.map((l) => l.line).join("\n");
      const parentId = headingStack.at(-1)?.id ?? docId;
      nodes.push({
        id: newNodeId(),
        type: "code_block",
        parentId,
        text: bodyText,
        sourceSpan: span(sourceId, sourceVersionId, blockStart, blockEnd, currentHeadingPath()),
        metadata: { fenceLanguage: lang || undefined, indentLen: indent.length },
      });
      if (i < lines.length) i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      while (headingStack.length && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      const parentId = headingStack.at(-1)?.id ?? docId;
      const hid = newNodeId();
      headingStack.push({ id: hid, level, title });
      nodes.push({
        id: hid,
        type: "heading",
        parentId,
        text: title,
        sourceSpan: span(sourceId, sourceVersionId, start, end, headingStack.slice(0, -1).map((h) => h.title)),
        metadata: { level },
      });
      i += 1;
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const paraStart = start;
    const buf: string[] = [];
    while (i < lines.length) {
      const cur = lines[i]!;
      if (!cur.line.trim()) break;
      if (/^#{1,6}\s+/.test(cur.line)) break;
      if (/^\s*```/.test(cur.line)) break;
      buf.push(cur.line);
      i += 1;
    }
    const paraEnd = i > 0 ? lines[i - 1]!.end : end;
    const paraText = buf.join("\n").trimEnd();
    if (!paraText) continue;

    const parentId = headingStack.at(-1)?.id ?? docId;
    nodes.push({
      id: newNodeId(),
      type: "paragraph",
      parentId,
      text: paraText,
      sourceSpan: span(sourceId, sourceVersionId, paraStart, paraEnd, currentHeadingPath()),
      metadata: {},
    });
  }

  return {
    sourceVersionId,
    documentTree: nodes,
    assets: [],
    warnings,
    parser: {
      name: label === "markdown" ? "markdown_text" : label === "html" ? "html_to_text" : "plain_text",
      version: "1",
      confidence: label === "markdown" ? 0.85 : 0.7,
    },
  };
}

function splitLinesWithOffsets(text: string): Array<{ line: string; start: number; end: number }> {
  const out: Array<{ line: string; start: number; end: number }> = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      out.push({ line: text.slice(start, i), start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start <= text.length) {
    out.push({ line: text.slice(start), start, end: text.length });
  }
  return out;
}

export const markdownTextParserAdapter: ParserAdapter = {
  name: "markdown_text",
  async parse(input, options) {
    return parseMarkdownLikeText(input, {
      sourceId: options.sourceId,
      sourceVersionId: options.sourceVersionId,
      label: "markdown",
    });
  },
};
