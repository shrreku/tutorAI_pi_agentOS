import type { Session } from "neo4j-driver";
import {
  linkSourceCoversCurriculum,
  linkTopicToConcept,
  linkTopicToWikiPage,
  mergeClaimContradiction,
  mergeClaimNode,
  mergeClaimSupersedes,
  mergeConceptNodes,
  mergeConceptRelation,
  mergeCoverageItemNode,
  mergeCoverageRecordNode,
  mergeCurriculumModuleNode,
  mergeCurriculumNode,
  mergeNotebookNode,
  mergeObjectiveListNode,
  mergeObjectiveNode,
  mergeSessionPlanNode,
  mergeSourceNode,
  mergeStudyPlanAndObjectives,
  mergeTopicNode,
  mergeWikiPageForSource,
  mergeWikiPageNode,
} from "../neo4j-projection.js";
import type { ProjectionOp, ProjectionPlan } from "./types.js";

export async function applyProjectionPlan(session: Session, plan: ProjectionPlan): Promise<void> {
  const { notebookId } = plan;

  for (const op of plan.operations) {
    switch (op.kind) {
      case "merge_notebook":
        await mergeNotebookNode(session, notebookId);
        break;
      case "merge_source":
        await mergeSourceNode(session, notebookId, op.sourceId, op.title);
        break;
      case "merge_topic":
        await mergeTopicNode(session, notebookId, op.sourceId, op.topicId, op.title);
        break;
      case "merge_concepts":
        if (op.concepts.length) await mergeConceptNodes(session, notebookId, op.concepts);
        break;
      case "link_topic_concept":
        await linkTopicToConcept(session, notebookId, op.topicId, op.conceptId);
        break;
      case "merge_concept_relation":
        await mergeConceptRelation(session, notebookId, op.fromId, op.toId, op.relationKind, op.confidence);
        break;
      case "merge_curriculum":
        await mergeCurriculumNode(session, notebookId, op.curriculumId, op.title);
        break;
      case "link_source_curriculum":
        await linkSourceCoversCurriculum(session, notebookId, op.sourceId, op.curriculumId);
        break;
      case "merge_module":
        await mergeCurriculumModuleNode(
          session,
          notebookId,
          op.module.id,
          op.module.curriculumId,
          op.module.title,
          op.module.summary,
          op.module.orderIndex,
          op.module.status,
        );
        break;
      case "merge_objective_list":
        await mergeObjectiveListNode(
          session,
          notebookId,
          op.list.id,
          op.list.curriculumId,
          op.list.moduleId,
          op.list.title,
          op.list.status,
        );
        break;
      case "merge_session_plan":
        await mergeSessionPlanNode(
          session,
          notebookId,
          op.plan.id,
          op.plan.curriculumId,
          op.plan.moduleId,
          op.plan.objectiveListId,
          op.plan.title,
          op.plan.status,
          op.plan.sessionGoal,
        );
        break;
      case "merge_objective":
        await mergeObjectiveNode(
          session,
          notebookId,
          op.objective.curriculumId,
          op.objective.id,
          op.objective.title,
          op.orderIndex,
          op.objective.status,
        );
        if (op.objectiveListId) {
          await session.run(
            `MATCH (ol:objective_list {id: $objectiveListId}), (o:Objective {id: $oid})
             WHERE ol.notebookId = $notebookId AND o.notebookId = $notebookId
             MERGE (ol)-[r:PLANS]->(o)
             SET r.notebookId = $notebookId,
                 r.orderIndex = $orderIndex,
                 r.updatedAt = datetime()`,
            { objectiveListId: op.objectiveListId, oid: op.objective.id, notebookId, orderIndex: op.orderIndex },
          );
        }
        if (op.sessionPlanId) {
          await session.run(
            `MATCH (sp:session_plan {id: $sessionPlanId}), (o:Objective {id: $oid})
             WHERE sp.notebookId = $notebookId AND o.notebookId = $notebookId
             MERGE (sp)-[r:PLANS]->(o)
             SET r.notebookId = $notebookId,
                 r.orderIndex = $orderIndex,
                 r.updatedAt = datetime()`,
            { sessionPlanId: op.sessionPlanId, oid: op.objective.id, notebookId, orderIndex: op.orderIndex },
          );
        }
        break;
      case "merge_study_plan":
        if (op.objectiveIds.length) {
          await mergeStudyPlanAndObjectives(
            session,
            notebookId,
            op.planId,
            op.title,
            op.objectiveIds,
            op.currentObjectiveId ?? op.objectiveIds[0]!,
          );
        }
        break;
      case "merge_coverage_item":
        await mergeCoverageItemNode(session, notebookId, op.item.id, op.item.title, op.item.itemFamily);
        break;
      case "merge_coverage_record":
        await mergeCoverageRecordNode(session, notebookId, op.record.id, op.record.coverageItemId, op.record.status);
        break;
      case "merge_claim": {
        const summary =
          op.claim.claimText.length > 200 ? `${op.claim.claimText.slice(0, 197)}…` : op.claim.claimText;
        await mergeClaimNode(session, notebookId, op.claim.id, summary, op.claim.sourceId, op.claim.conceptIds[0] ?? null);
        break;
      }
      case "merge_claim_supersedes":
        await mergeClaimSupersedes(session, notebookId, op.winnerId, op.supersededId);
        break;
      case "merge_claim_contradiction":
        await mergeClaimContradiction(session, notebookId, op.claimIdA, op.claimIdB);
        break;
      case "merge_wiki_page":
        await mergeWikiPageNode(
          session,
          notebookId,
          op.page.id,
          op.page.title,
          op.page.pageKey,
          op.page.pageType,
          op.page.linkedConceptId,
        );
        break;
      case "link_wiki_source":
        await mergeWikiPageForSource(session, notebookId, op.pageId, op.sourceId);
        break;
      case "link_topic_wiki_page":
        await linkTopicToWikiPage(session, notebookId, op.topicId, op.pageId);
        break;
      default:
        break;
    }
  }
}
