import type { SourceSpan } from "@studyagent/schemas";

export type DocumentNodeType =
  | "document"
  | "page"
  | "section"
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "figure"
  | "equation"
  | "code_block"
  | "footnote"
  | "callout"
  | "transcript_segment";

export type NormalizedDocumentNode = {
  id: string;
  type: DocumentNodeType;
  parentId?: string;
  text: string;
  sourceSpan: SourceSpan;
  metadata: Record<string, unknown>;
};

export type ParseResult = {
  sourceVersionId: string;
  documentTree: NormalizedDocumentNode[];
  assets: Array<Record<string, unknown>>;
  warnings: string[];
  parser: {
    name: string;
    version: string;
    confidence: number;
  };
};

export type ParserParseOptions = {
  sourceVersionId: string;
  sourceId: string;
  /** Original upload filename when known (used by PDF/LlamaParse). */
  filename?: string | null;
};

export type ParserAdapter = {
  name: string;
  parse(input: Uint8Array, options: ParserParseOptions): Promise<ParseResult>;
};
