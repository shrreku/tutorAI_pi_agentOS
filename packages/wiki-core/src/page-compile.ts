import type { Claim, ProvenanceRef, WikiPage } from "@studyagent/schemas";

export type PageCompileInput = {
  pageId: string;
  notebookId: string;
  title: string;
  pageKey: string;
  claims: Claim[];
};

export function compileSourceBackedPage(input: PageCompileInput): Omit<WikiPage, "createdAt" | "updatedAt"> {
  const provenance = input.claims.flatMap((claim) => claim.provenance) as ProvenanceRef[];

  return {
    id: input.pageId,
    notebookId: input.notebookId,
    pageType: "concept",
    pageKey: input.pageKey,
    title: input.title,
    version: 1,
    status: "draft",
    structured: { claimIds: input.claims.map((claim) => claim.id) },
    markdown: input.claims.map((claim) => `- ${claim.claimText}`).join("\n"),
    provenance,
  };
}
