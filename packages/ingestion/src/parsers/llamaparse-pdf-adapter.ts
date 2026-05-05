import type { ParserAdapter } from "../document-model.js";
import { parseMarkdownLikeText } from "./markdown-text-parser.js";
import { llamaParsePdfToMarkdown } from "./llamaparse-client.js";
import type { LlamaParseTier } from "./llamaparse-client.js";

export function createLlamaParsePdfAdapter(cfg: {
  apiKey: string;
  baseUrl: string;
  tier: LlamaParseTier;
}): ParserAdapter {
  return {
    name: "llamaparse_pdf",
    async parse(input, options) {
      const safeName = options.filename?.trim() || "document.pdf";
      const { markdown, jobId, warnings: lw } = await llamaParsePdfToMarkdown(input, safeName, {
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        tier: cfg.tier,
      });

      const mdBytes = new TextEncoder().encode(markdown);
      const inner = parseMarkdownLikeText(mdBytes, {
        sourceId: options.sourceId,
        sourceVersionId: options.sourceVersionId,
        label: "markdown",
      });

      inner.warnings.unshift(
        ...lw,
        `LlamaParse job ${jobId}: markdown normalized to StudyAgent document tree (LlamaParse JSON is not persisted on the wiki path).`,
      );
      inner.parser = { name: "llamaparse_pdf", version: "v2", confidence: 0.92 };
      return inner;
    },
  };
}
