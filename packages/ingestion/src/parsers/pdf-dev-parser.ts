import type { ParserAdapter } from "../document-model.js";
import { newNodeId } from "../ids.js";

export const pdfDevParserAdapter: ParserAdapter = {
  name: "pdf_dev_stub",
  async parse(input, options) {
    const docId = newNodeId();
    const calloutId = newNodeId();
    const message =
      "PDF bytes received but no LlamaParse API key is configured. " +
      "Add LLAMAPARSE_API_KEY (or wire the managed adapter) to extract text for this notebook.";

    return {
      sourceVersionId: options.sourceVersionId,
      documentTree: [
        {
          id: docId,
          type: "document",
          text: "",
          sourceSpan: {
            sourceId: options.sourceId,
            sourceVersionId: options.sourceVersionId,
            charStart: 0,
            charEnd: 0,
            headingPath: [],
          },
          metadata: { byteLength: input.byteLength },
        },
        {
          id: calloutId,
          type: "callout",
          parentId: docId,
          text: message,
          sourceSpan: {
            sourceId: options.sourceId,
            sourceVersionId: options.sourceVersionId,
            charStart: 0,
            charEnd: message.length,
            headingPath: [],
          },
          metadata: { variant: "warning" },
        },
      ],
      assets: [],
      warnings: ["pdf_dev_stub: structured PDF parsing skipped in development"],
      parser: { name: "pdf_dev_stub", version: "1", confidence: 0.2 },
    };
  },
};
