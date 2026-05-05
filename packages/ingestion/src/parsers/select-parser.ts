import type { ParserAdapter } from "../document-model.js";
import { htmlTextParserAdapter } from "./html-text-parser.js";
import { createLlamaParsePdfAdapter } from "./llamaparse-pdf-adapter.js";
import type { LlamaParseTier } from "./llamaparse-client.js";
import { markdownTextParserAdapter } from "./markdown-text-parser.js";
import { pdfDevParserAdapter } from "./pdf-dev-parser.js";
import { plainTextParserAdapter } from "./plain-text-parser.js";

export type ParserSelectionOptions = {
  llamaParse?: { apiKey: string; baseUrl: string; tier: LlamaParseTier };
};

export function parserForSourceType(sourceType: string, opts?: ParserSelectionOptions): ParserAdapter {
  switch (sourceType) {
    case "markdown":
      return markdownTextParserAdapter;
    case "text":
      return plainTextParserAdapter;
    case "html":
      return htmlTextParserAdapter;
    case "pdf":
      return opts?.llamaParse?.apiKey
        ? createLlamaParsePdfAdapter(opts.llamaParse)
        : pdfDevParserAdapter;
    case "binary":
      return plainTextParserAdapter;
    default:
      return plainTextParserAdapter;
  }
}
