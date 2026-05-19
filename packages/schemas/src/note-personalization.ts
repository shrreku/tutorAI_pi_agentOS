import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";
import { learnerReadinessSchema } from "./learning-levels.js";

export const notePersonalizationSectionKindSchema = z.enum([
  "from_source",
  "for_mistakes",
  "learner_specific",
  "readiness",
]);

export type NotePersonalizationSectionKind = z.infer<typeof notePersonalizationSectionKindSchema>;

export const notePersonalizationSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: notePersonalizationSectionKindSchema,
  body: z.string().min(1),
  sourceRefs: z.array(nodeRefSchema).default([]),
});

export type NotePersonalizationSection = z.infer<typeof notePersonalizationSectionSchema>;

export const notePersonalizationMetadataSchema = z.object({
  whyPersonalized: z.string().min(1).optional(),
  learnerReadiness: z.array(learnerReadinessSchema).default([]),
  weakConceptIds: z.array(idSchema).default([]),
  mistakeConceptIds: z.array(idSchema).default([]),
  sourceRefs: z.array(nodeRefSchema).default([]),
  objectiveRefs: z.array(nodeRefSchema).default([]),
  sessionRefs: z.array(nodeRefSchema).default([]),
  sections: z.array(notePersonalizationSectionSchema).default([]),
});

export type NotePersonalizationMetadata = z.infer<typeof notePersonalizationMetadataSchema>;

export const noteArtifactPayloadSchema = z
  .object({
    markdown: z.string().default(""),
    keyPoints: z.array(z.string().min(1)).default([]),
    examples: z.array(z.string().min(1)).default([]),
    misconceptions: z.array(z.string().min(1)).default([]),
    personalization: notePersonalizationMetadataSchema.optional(),
  })
  .refine(
    (payload) => {
      const sectionBodies = (payload.personalization?.sections ?? []).filter((section) => section.body.trim().length > 0);
      if (sectionBodies.length > 0) return payload.markdown.trim().length >= 1 || sectionBodies.some((s) => s.body.length >= 20);
      return payload.markdown.trim().length >= 40;
    },
    { message: "Note needs substantive markdown or personalized sections." },
  );

export type NoteArtifactPayload = z.infer<typeof noteArtifactPayloadSchema>;

export function sectionTitleForKind(kind: NotePersonalizationSectionKind): string {
  switch (kind) {
    case "from_source":
      return "From your source";
    case "for_mistakes":
      return "For your mistakes";
    case "learner_specific":
      return "For your learning";
    case "readiness":
      return "For your readiness";
    default:
      return "Personalized notes";
  }
}

export function mergeNoteArtifactPayload(
  existing: Record<string, unknown>,
  patch: { noteMarkdown?: string; clearPersonalization?: boolean },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };
  if (patch.noteMarkdown !== undefined) {
    next.markdown = patch.noteMarkdown;
    next.blockOwnerType = "human";
  }
  if (patch.clearPersonalization) {
    delete next.personalization;
  } else if (existing.personalization && typeof existing.personalization === "object") {
    next.personalization = existing.personalization;
  }
  return next;
}

export function parseNotePersonalization(value: unknown): NotePersonalizationMetadata | null {
  const parsed = notePersonalizationMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
