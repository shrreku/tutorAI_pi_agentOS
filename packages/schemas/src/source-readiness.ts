import { z } from "zod";

export const sourceReadinessComponentSchema = z.object({
  ready: z.boolean(),
  status: z.enum(["pending", "ready", "degraded", "failed"]),
  updatedAt: z.string().datetime().nullable().default(null),
  message: z.string().nullable().default(null),
});

export const sourceReadinessSchema = z.object({
  retrieval: sourceReadinessComponentSchema,
  wiki: sourceReadinessComponentSchema,
  planning: sourceReadinessComponentSchema,
  search: sourceReadinessComponentSchema,
  projection: sourceReadinessComponentSchema,
  learnerSourceWiki: sourceReadinessComponentSchema,
  tutoring: sourceReadinessComponentSchema,
});

export type SourceReadinessComponent = z.infer<typeof sourceReadinessComponentSchema>;
export type SourceReadiness = z.infer<typeof sourceReadinessSchema>;

export function sourceReadinessComponent(
  ready: boolean,
  input: Partial<Omit<SourceReadinessComponent, "ready">> = {},
): SourceReadinessComponent {
  return sourceReadinessComponentSchema.parse({
    ready,
    status: input.status ?? (ready ? "ready" : "pending"),
    updatedAt: input.updatedAt ?? null,
    message: input.message ?? null,
  });
}

export function buildSourceReadiness(input: Partial<Record<keyof SourceReadiness, SourceReadinessComponent>>): SourceReadiness {
  const pending = sourceReadinessComponent(false);
  return sourceReadinessSchema.parse({
    retrieval: input.retrieval ?? pending,
    wiki: input.wiki ?? pending,
    planning: input.planning ?? pending,
    search: input.search ?? pending,
    projection: input.projection ?? pending,
    learnerSourceWiki: input.learnerSourceWiki ?? pending,
    tutoring: input.tutoring ?? pending,
  });
}

export function learnerSourceStatus(readiness: SourceReadiness): { label: string; detail: string } {
  if (!readiness.tutoring.ready) {
    return {
      label: "Preparing for tutoring",
      detail: readiness.tutoring.message ?? "The tutor is still preparing this source.",
    };
  }
  if (!readiness.learnerSourceWiki.ready || !readiness.projection.ready) {
    return {
      label: "Ready for tutoring; Source Wiki still improving",
      detail: "You can start tutoring now. Source Wiki and Study Map details may continue filling in.",
    };
  }
  return {
    label: "Ready",
    detail: "Tutor, Source Wiki, search, planning, and Study Map are ready.",
  };
}
