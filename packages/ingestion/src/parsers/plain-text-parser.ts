import type { SourceSpan } from "@studyagent/schemas";
import type { ParserAdapter } from "../document-model.js";
import { newNodeId } from "../ids.js";

function span(sourceId: string, sourceVersionId: string, start: number, end: number): SourceSpan {
  return { sourceId, sourceVersionId, charStart: start, charEnd: end, headingPath: [] };
}

export const plainTextParserAdapter: ParserAdapter = {
  name: "plain_text",
  async parse(input, options) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(input).replace(/\r\n/g, "\n");
    const docId = newNodeId();
    const paraId = newNodeId();
    const trimmed = text.trimEnd();
    const end = trimmed.length;

    return {
      sourceVersionId: options.sourceVersionId,
      documentTree: [
        {
          id: docId,
          type: "document",
          text: "",
          sourceSpan: span(options.sourceId, options.sourceVersionId, 0, text.length),
          metadata: {},
        },
        {
          id: paraId,
          type: "paragraph",
          parentId: docId,
          text: trimmed,
          sourceSpan: span(options.sourceId, options.sourceVersionId, 0, end),
          metadata: {},
        },
      ],
      assets: [],
      warnings: [],
      parser: { name: "plain_text", version: "1", confidence: 0.9 },
    };
  },
};
