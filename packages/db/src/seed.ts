import { createDb } from "./client.js";
import {
  chunks,
  notebooks,
  sourceVersions,
  sources,
  studyTemplates,
  users,
} from "./schema/index.js";

const hostedBetaTemplates = [
  {
    notebookId: "nb_template_algebra",
    sourceId: "src_template_algebra",
    sourceVersionId: "sv_template_algebra_v1",
    chunkId: "chk_template_algebra_1",
    templateId: "st_template_algebra_foundations",
    slug: "algebra-foundations",
    title: "Algebra Foundations",
    topic: "Algebra",
    sourceLevel: "beginner",
    estimatedMinutes: 35,
    studyMode: "guided practice",
    expectedOutcome: "Solve linear equations and explain each transformation.",
    text: "Linear equations preserve equality when the same operation is applied to both sides. Isolate the variable one operation at a time and check the result by substitution.",
    sortOrder: 10,
  },
  {
    notebookId: "nb_template_physics",
    sourceId: "src_template_physics",
    sourceVersionId: "sv_template_physics_v1",
    chunkId: "chk_template_physics_1",
    templateId: "st_template_newtonian_motion",
    slug: "newtonian-motion",
    title: "Newtonian Motion",
    topic: "Physics",
    sourceLevel: "intermediate",
    estimatedMinutes: 45,
    studyMode: "concept walkthrough",
    expectedOutcome: "Connect force, mass, acceleration, and motion graphs.",
    text: "Newton's second law states that net force equals mass times acceleration. Motion graphs show position, velocity, and acceleration relationships across time.",
    sortOrder: 20,
  },
  {
    notebookId: "nb_template_biology",
    sourceId: "src_template_biology",
    sourceVersionId: "sv_template_biology_v1",
    chunkId: "chk_template_biology_1",
    templateId: "st_template_cell_biology",
    slug: "cell-biology",
    title: "Cell Biology Essentials",
    topic: "Biology",
    sourceLevel: "beginner",
    estimatedMinutes: 40,
    studyMode: "source-grounded review",
    expectedOutcome: "Identify core organelles and explain their functions.",
    text: "Cells contain organelles that coordinate life processes. The nucleus stores genetic information, mitochondria convert energy, and membranes regulate exchange.",
    sortOrder: 30,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const { db, sql } = createDb(url);
  const devEmail = "dev@studyagent.local";
  const userId = "usr_dev_local";

  await db
    .insert(users)
    .values({
      id: userId,
      email: devEmail,
      displayName: "Local Developer",
      settingsJson: {},
    })
    .onConflictDoNothing({ target: users.id });

  for (const template of hostedBetaTemplates) {
    await db
      .insert(notebooks)
      .values({
        id: template.notebookId,
        ownerId: userId,
        title: template.title,
        description: `${template.topic} hosted beta template`,
        goal: template.expectedOutcome,
        defaultMode: "explore",
        workspaceType: "study_template",
        settingsJson: { seededFor: "hosted_beta_local" },
      })
      .onConflictDoNothing({ target: notebooks.id });

    await db
      .insert(sources)
      .values({
        id: template.sourceId,
        notebookId: template.notebookId,
        title: `${template.title} Source`,
        sourceType: "text",
        originalObjectKey: `seed/${template.sourceId}.txt`,
        status: "tutoring_ready",
        metadataJson: {
          filename: `${template.slug}.txt`,
          mimeType: "text/plain",
          tutoringReady: true,
          sourceReadiness: {
            retrieval: { ready: true, status: "ready", updatedAt: null, message: null },
            search: { ready: true, status: "ready", updatedAt: null, message: null },
            tutoring: { ready: true, status: "ready", updatedAt: null, message: null },
          },
        },
      })
      .onConflictDoNothing({ target: sources.id });

    await db
      .insert(sourceVersions)
      .values({
        id: template.sourceVersionId,
        sourceId: template.sourceId,
        version: 1,
        parserName: "seed",
        parserVersion: "hosted-beta",
        contentHash: template.chunkId,
        parseConfidence: 1,
        documentTreeJson: { type: "document", text: template.text },
      })
      .onConflictDoNothing({ target: sourceVersions.id });

    await db
      .insert(chunks)
      .values({
        id: template.chunkId,
        sourceVersionId: template.sourceVersionId,
        chunkType: "retrieval",
        text: template.text,
        tokenCount: template.text.split(/\s+/).length,
        headingPath: [template.title],
        metadataJson: { seededFor: "hosted_beta_local" },
      })
      .onConflictDoNothing({ target: chunks.id });

    await db
      .insert(studyTemplates)
      .values({
        id: template.templateId,
        slug: template.slug,
        title: template.title,
        topic: template.topic,
        sourceLevel: template.sourceLevel,
        estimatedMinutes: template.estimatedMinutes,
        studyMode: template.studyMode,
        expectedOutcome: template.expectedOutcome,
        status: "published",
        notebookId: template.notebookId,
        readinessJson: { status: "ready", seededFor: "hosted_beta_local" },
        sourceRightsJson: { status: "reviewed", seededFor: "hosted_beta_local" },
        sortOrder: template.sortOrder,
      })
      .onConflictDoNothing({ target: studyTemplates.id });
  }

  console.log("Seed ensured dev user", userId, devEmail);
  console.log("Seed ensured hosted beta templates", hostedBetaTemplates.length);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
