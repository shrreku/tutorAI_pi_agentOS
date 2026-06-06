import { describe, expect, it } from "vitest";
import { buildStudyAgentHostStateSignature } from "./index.js";

describe("buildStudyAgentHostStateSignature", () => {
  const baseContext = {
    notebookId: "nb_1",
    userId: "user_1",
    sessionId: "sess_1",
    notebookTitle: "Notebook",
    activeMode: "learn" as const,
    selectedNodeRefs: [],
  };

  it("includes binding inputs in the signature", () => {
    const withoutExtras = buildStudyAgentHostStateSignature(baseContext);
    const withExtras = buildStudyAgentHostStateSignature({
      ...baseContext,
      openArtifact: { id: "artifact_1", artifactType: "quiz", title: "Quiz 1", status: "ready" },
    });

    expect(withExtras).not.toBe(withoutExtras);
  });

  it("does not change when non-binding study state changes", () => {
    const first = buildStudyAgentHostStateSignature({
      ...baseContext,
      currentObjective: "Objective A",
      learnerStateSummary: "Needs more practice",
      weakConcepts: ["concept_1"],
    });
    const second = buildStudyAgentHostStateSignature({
      ...baseContext,
      currentObjective: "Objective B",
      learnerStateSummary: "Recovered",
      weakConcepts: ["concept_2"],
    });

    expect(first).toBe(second);
  });

  it("changes when openArtifact identity changes", () => {
    const first = buildStudyAgentHostStateSignature({
      ...baseContext,
      openArtifact: { id: "artifact_1", artifactType: "quiz", title: "Quiz 1", status: "ready" },
    });
    const second = buildStudyAgentHostStateSignature({
      ...baseContext,
      openArtifact: { id: "artifact_2", artifactType: "quiz", title: "Quiz 2", status: "ready" },
    });

    expect(first).not.toBe(second);
  });

  it("changes when prompt fingerprint changes", () => {
    const first = buildStudyAgentHostStateSignature(baseContext);
    const second = buildStudyAgentHostStateSignature({
      ...baseContext,
      additionalInstructions: ["[New session]", "Re-read the notebook state before answering."],
    });
    expect(first).not.toBe(second);
  });

  it("is stable for repeated calls with identical inputs", () => {
    const context = {
      ...baseContext,
      currentObjective: "Objective A",
      sourceScopePolicy: "soft_source_scope" as const,
    };
    expect(buildStudyAgentHostStateSignature(context)).toBe(buildStudyAgentHostStateSignature(context));
  });

  it("includes tool catalog identity in the signature", () => {
    const signature = buildStudyAgentHostStateSignature(baseContext);
    expect(signature).toMatch(/^studyagent-host-state-v2:/);
  });

  it("changes when prompt template version changes", () => {
    const first = buildStudyAgentHostStateSignature(baseContext, { promptTemplateVersion: "studyagent-tutor-v1" });
    const second = buildStudyAgentHostStateSignature(baseContext, { promptTemplateVersion: "studyagent-tutor-v2" });

    expect(first).not.toBe(second);
  });

  it("changes when tool contract catalog fingerprint changes", () => {
    const first = buildStudyAgentHostStateSignature(baseContext, { toolContractCatalogFingerprint: "catalog-a" });
    const second = buildStudyAgentHostStateSignature(baseContext, { toolContractCatalogFingerprint: "catalog-b" });

    expect(first).not.toBe(second);
  });
});
