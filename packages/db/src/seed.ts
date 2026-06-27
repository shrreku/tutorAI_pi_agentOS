import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import {
  chunks,
  claims,
  concepts,
  curricula,
  curriculumModules,
  notebooks,
  objectiveLists,
  objectives,
  sessionPlans,
  notebooks,
  sourceVersions,
  sources,
  studyTemplates,
  users,
  wikiPages,
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
    const conceptId = `con_${template.slug}`;
    const claimId = `clm_${template.slug}`;
    const wikiPageId = `wiki_${template.slug}`;
    const curriculumId = `cur_${template.slug}`;
    const moduleId = `mod_${template.slug}`;
    const objectiveId = `obj_${template.slug}`;
    const objectiveListId = `ol_${template.slug}`;
    const sessionPlanId = `sp_${template.slug}`;

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
      .insert(concepts)
      .values({
        id: conceptId,
        notebookId: template.notebookId,
        canonicalName: template.topic,
        aliases: [],
        conceptType: "seed_topic",
        description: template.expectedOutcome,
        confidence: 1,
        metadataJson: { seededFor: "hosted_beta_local" },
      })
      .onConflictDoNothing({ target: concepts.id });

    await db
      .insert(claims)
      .values({
        id: claimId,
        notebookId: template.notebookId,
        sourceId: template.sourceId,
        sourceVersionId: template.sourceVersionId,
        claimType: "source_summary",
        claimText: template.text,
        status: "verified",
        confidence: 1,
        qualityScore: 1,
        supportScore: 1,
        sourceSpanJson: { chunkId: template.chunkId },
        sourceChunkIds: [template.chunkId],
        metadataJson: { seededFor: "hosted_beta_local" },
      })
      .onConflictDoNothing({ target: claims.id });

    await db
      .insert(wikiPages)
      .values({
        id: wikiPageId,
        notebookId: template.notebookId,
        pageType: "topic",
        pageKey: template.slug,
        title: template.title,
        version: 1,
        status: "published",
        structuredJson: {
          summary: template.text,
          seededFor: "hosted_beta_local",
        },
        markdown: template.text,
        sourceClaimIds: [claimId],
        sourceChunkIds: [template.chunkId],
        confidenceSummaryJson: { confidence: 1 },
        qualityScore: 1,
      })
      .onConflictDoNothing({ target: wikiPages.id });

    await db
      .insert(curricula)
      .values({
        id: curriculumId,
        notebookId: template.notebookId,
        title: `${template.title} Curriculum`,
        curriculumType: "guided",
        scopeJson: { topic: template.topic },
        status: "active",
        sourceIds: [template.sourceId],
        coverageSummaryJson: { seededFor: "hosted_beta_local" },
        confidence: 1,
      })
      .onConflictDoNothing({ target: curricula.id });

    await db
      .insert(curriculumModules)
      .values({
        id: moduleId,
        notebookId: template.notebookId,
        curriculumId,
        title: template.title,
        summary: template.expectedOutcome,
        orderIndex: 0,
        status: "active",
        sourceRefsJson: [
          { sourceId: template.sourceId, sourceVersionId: template.sourceVersionId },
        ],
        targetConceptIds: [conceptId],
        estimatedSessionCount: 1,
        coverageRequirementsJson: { seededFor: "hosted_beta_local" },
        masteryGateJson: {},
      })
      .onConflictDoNothing({ target: curriculumModules.id });

    await db
      .update(curricula)
      .set({ activeModuleId: moduleId })
      .where(eq(curricula.id, curriculumId));

    await db
      .insert(objectives)
      .values({
        id: objectiveId,
        notebookId: template.notebookId,
        curriculumId,
        title: template.expectedOutcome,
        status: "active",
        orderIndex: 0,
        targetConceptIds: [conceptId],
        successCriteriaJson: { explanationRequired: true },
        sourceRefsJson: [{ sourceId: template.sourceId, chunkId: template.chunkId }],
        suggestedMode: template.studyMode,
        readinessScore: 1,
      })
      .onConflictDoNothing({ target: objectives.id });

    await db
      .insert(objectiveLists)
      .values({
        id: objectiveListId,
        notebookId: template.notebookId,
        curriculumId,
        moduleId,
        title: `${template.title} Objectives`,
        status: "active",
        currentObjectiveId: objectiveId,
        objectiveIdsOrdered: [objectiveId],
        coverageSnapshotJson: { seededFor: "hosted_beta_local" },
      })
      .onConflictDoNothing({ target: objectiveLists.id });

    await db
      .insert(sessionPlans)
      .values({
        id: sessionPlanId,
        notebookId: template.notebookId,
        curriculumId,
        moduleId,
        objectiveListId,
        title: `${template.title} Study Session`,
        status: "active",
        sessionGoal: template.expectedOutcome,
        plannedObjectiveIds: [objectiveId],
        openerJson: { prompt: `Start ${template.title}` },
        exitCriteriaJson: { objectiveId },
        recommendationReasonJson: { seededFor: "hosted_beta_local" },
      })
      .onConflictDoNothing({ target: sessionPlans.id });

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
