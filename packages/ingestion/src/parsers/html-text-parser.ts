import type { ParserAdapter } from "../document-model.js";
import { parseMarkdownLikeText } from "./markdown-text-parser.js";

function stripHtmlToText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const htmlTextParserAdapter: ParserAdapter = {
  name: "html_text",
  async parse(input, options) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const stripped = stripHtmlToText(decoder.decode(input));
    const asUtf8 = new TextEncoder().encode(stripped);
    const inner = parseMarkdownLikeText(asUtf8, {
      sourceId: options.sourceId,
      sourceVersionId: options.sourceVersionId,
      label: "html",
    });
    inner.warnings.unshift("HTML normalized to text; structure may be lossy without LlamaParse.");
    inner.parser = { name: "html_text", version: "1", confidence: 0.55 };
    return inner;
  },
};
