import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReferenceSurface } from "@studyagent/schemas";
import FullPanelViewer from "./FullPanelViewer.js";

describe("FullPanelViewer", () => {
  const renderViewer = (node: React.ComponentProps<typeof FullPanelViewer>["node"], referenceSurface?: ReferenceSurface) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (referenceSurface) {
      client.setQueryData(["reference-surface", "nb_1", node.id], referenceSurface);
    }
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FullPanelViewer notebookId="nb_1" node={node} onClose={() => {}} />
      </QueryClientProvider>,
    );
  };

  const renderViewerWithActions = (node: React.ComponentProps<typeof FullPanelViewer>["node"], referenceSurface?: ReferenceSurface) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (referenceSurface) {
      client.setQueryData(["reference-surface", "nb_1", node.id], referenceSurface);
    }
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FullPanelViewer notebookId="nb_1" node={node} onClose={() => {}} onLaunchTutor={() => {}} onShowProvenance={() => {}} />
      </QueryClientProvider>,
    );
  };

  const baseNode = {
    id: "artifact_1",
    nodeType: "artifact",
    labels: ["Artifact"],
    properties: {
      title: "Artifact",
      summary: "Artifact summary",
    },
  };

  it("renders worked example artifacts with dedicated heading", () => {
    const html = renderViewer(
      {
          ...baseNode,
          properties: {
            ...baseNode.properties,
            artifactType: "worked_example",
            payload: { problemStatement: "Differentiate x^2" },
          },
        },
      {
        id: "surface_1",
        notebookId: "nb_1",
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        title: "Artifact",
        surfaceType: "artifact",
        summary: "Artifact summary",
        status: "ready",
        blocks: [
          { id: "reference", kind: "markdown", title: "Reference", content: "Differentiate x^2", evidenceRefs: [] },
          { id: "steps", kind: "step_list", title: "Solution steps", content: [{ title: "Apply the power rule" }], evidenceRefs: [] },
        ],
        scopeRefs: [],
        sourceRefs: [],
        provenanceRefs: [],
        coverageRefs: [],
        primaryActions: ["ask_tutor"],
        quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
      },
    );
    expect(html).toContain("Artifact");
    expect(html).toContain("Differentiate x^2");
    expect(html).toContain("Apply the power rule");
  });

  it("renders quiz artifacts as one-question practice surfaces", () => {
    const html = renderViewer(
      {
          ...baseNode,
          properties: {
            ...baseNode.properties,
            artifactType: "quiz",
          },
        },
      {
        id: "surface_2",
        notebookId: "nb_1",
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        title: "Quiz",
        surfaceType: "artifact",
        summary: "Quiz summary",
        status: "ready",
        blocks: [
          { id: "overview", kind: "markdown", title: "Practice goal", content: "This intro is not needed.", evidenceRefs: [] },
          {
            id: "questions",
            kind: "question_list",
            title: "Questions",
            content: [{
              id: "q1",
              prompt: "What is x? a) x b) y",
              choices: ["x", "y"],
              answer: "a",
              explanation: "x is the reference value.",
            }],
            evidenceRefs: [],
          },
        ],
        scopeRefs: [],
        sourceRefs: [],
        provenanceRefs: [],
        coverageRefs: [],
        primaryActions: ["ask_tutor"],
        quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
      },
    );
    expect(html).toContain("Quiz");
    expect(html).toContain("What is x?");
    expect(html).not.toContain("a) x b) y");
    expect(html).not.toContain("Quiz summary");
    expect(html).not.toContain("Practice goal");
    expect(html).not.toContain("This intro is not needed.");
    expect(html).toContain("1 / 1");
    expect(html).toContain("Submit answer");
    expect(html).toContain("Extend with LLM");
    expect(html).not.toContain("x is the reference value.");
  });

  it("hides raw draft lifecycle labels on artifact surfaces", () => {
    const html = renderViewer(baseNode, {
      id: "surface_draft",
      notebookId: "nb_1",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      title: "Draft note",
      surfaceType: "artifact",
      summary: "Draft summary",
      status: null,
      blocks: [{ id: "body", kind: "markdown", title: "Note", content: "Draft body", evidenceRefs: [] }],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor"],
      quality: { confidence: null, sourceBacked: false, needsReview: true },
    });
    expect(html).not.toContain("draft");
    expect(html).toContain("Draft body");
  });

  it("renders session digest artifacts with next actions", () => {
    const html = renderViewer(
      {
          ...baseNode,
          properties: {
            ...baseNode.properties,
            artifactType: "session_digest",
            payload: { takeaway: "You connected heat flux to temperature gradients.", nextActions: [{ title: "Review Fourier's law" }] },
          },
        },
      {
        id: "surface_3",
        notebookId: "nb_1",
        nodeRef: { refType: "artifact", refId: "artifact_1" },
        title: "Session Digest",
        surfaceType: "artifact",
        summary: "You connected heat flux to temperature gradients.",
        status: "ready",
        blocks: [{ id: "next_actions", kind: "step_list", title: "Next actions", content: [{ title: "Review Fourier's law" }], evidenceRefs: [] }],
        scopeRefs: [],
        sourceRefs: [],
        provenanceRefs: [],
        coverageRefs: [],
        primaryActions: ["ask_tutor"],
        quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
      },
    );
    expect(html).toContain("Session Digest");
    expect(html).toContain("Review Fourier");
  });

  it("does not render the old study-actions sidebar for source surfaces", () => {
    const html = renderViewer(
      {
        id: "src_1",
        nodeType: "source",
        labels: ["Source"],
        properties: { title: "Lecture notes" },
      },
      {
        id: "surface_src_1",
        notebookId: "nb_1",
        nodeRef: { refType: "source", refId: "src_1" },
        title: "Lecture notes",
        surfaceType: "source",
        summary: null,
        status: "tutoring_ready",
        blocks: [{ id: "metadata", kind: "metadata", title: "Source", content: { status: "tutoring_ready" }, evidenceRefs: [] }],
        scopeRefs: [] as ReferenceSurface["scopeRefs"],
        sourceRefs: [] as ReferenceSurface["sourceRefs"],
        provenanceRefs: [] as ReferenceSurface["provenanceRefs"],
        coverageRefs: [] as ReferenceSurface["coverageRefs"],
        primaryActions: ["ask_tutor"],
        quality: { confidence: null, sourceBacked: true, needsReview: false },
      },
    );
    expect(html).toContain("Lecture notes");
    expect(html).not.toContain("Study actions");
    expect(html).toContain("Open original");
    expect(html).not.toContain("Evidence refs");
  });

  it("opens weak concept nodes through the underlying concept wiki page", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const node = {
      id: "weak_cnc_1",
      nodeType: "weak_concept",
      labels: ["WeakConcept"],
      properties: { title: "Fourier law", conceptId: "cnc_1" },
    };
    client.setQueryData(["reference-surface", "nb_1", "cnc_1"], {
      id: "surface_cnc_1",
      notebookId: "nb_1",
      nodeRef: { refType: "concept", refId: "cnc_1" },
      title: "Fourier law",
      surfaceType: "concept",
      summary: "Heat flux relates to temperature gradient.",
      status: "active",
      blocks: [{ id: "definition", kind: "summary", title: "Definition", content: "Heat flux relates to temperature gradient.", evidenceRefs: [] }],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor"],
      quality: { confidence: 0.8, sourceBacked: true, needsReview: false },
    } satisfies ReferenceSurface);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FullPanelViewer notebookId="nb_1" node={node} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).toContain("Heat flux relates");
    expect(html).not.toContain("Reference needs review");
  });

  it("renders compact header actions", () => {
    const html = renderViewerWithActions(baseNode, {
      id: "surface_actions",
      notebookId: "nb_1",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      title: "Artifact",
      surfaceType: "artifact",
      summary: "Artifact summary",
      status: "ready",
      blocks: [],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor"],
      quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
    });
    expect(html).toContain("min-height:36px");
    expect(html).toContain("← Back");
    expect(html).toContain("Teach me");
    expect(html).toContain("Evidence");
    expect(html).not.toContain("Back to Workspace");
  });

  it("renders regeneration controls for artifacts and pages", () => {
    const html = renderViewerWithActions(baseNode, {
      id: "surface_regen",
      notebookId: "nb_1",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      title: "Practice Quiz",
      surfaceType: "artifact",
      summary: "Quiz summary",
      status: "ready",
      blocks: [],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor"],
      quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
    });
    expect(html).toContain("Regenerate");
    expect(html).toContain("Regenerate with LLM");
  });

  it("renders generation badges, markdown tables, and latex formulas", () => {
    const html = renderViewer(baseNode, {
      id: "surface_math",
      notebookId: "nb_1",
      nodeRef: { refType: "artifact", refId: "artifact_1" },
      title: "Formula Sheet",
      surfaceType: "artifact",
      summary: "Formula summary",
      status: "ready",
      blocks: [{
        id: "body",
        kind: "markdown",
        title: "Sheet",
        content: ["# Formula Sheet", "| Formula | Use |", "| --- | --- |", "| $q=-k\\\\nabla T$ | Heat flux |", "", "$$q=-k\\\\nabla T$$"].join("\n"),
        evidenceRefs: [],
      }],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor"],
      quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
      generation: { mode: "ai", label: "AI", generatedAt: "2026-05-19T00:00:00.000Z" },
    });
    expect(html).toContain("AI");
    expect(html).toContain("<table");
    expect(html).toContain("katex");
    expect(html).toContain("∇");
  });

  it("renders objective nodes as reference pages", () => {
    const node = {
          id: "obj_1",
          nodeType: "objective",
          labels: ["Objective"],
          properties: { title: "Explain conduction", summary: "Understand conduction before Fourier's law." },
        };
    const html = renderViewer(node, {
      id: "surface_obj_1",
      notebookId: "nb_1",
      nodeRef: { refType: "objective", refId: "obj_1" },
      title: "Explain conduction",
      surfaceType: "objective",
      summary: "Understand conduction before Fourier's law.",
      status: "active",
      blocks: [{ id: "summary", kind: "summary", title: "Objective", content: "Understand conduction before Fourier's law.", evidenceRefs: [] }],
      scopeRefs: [],
      sourceRefs: [],
      provenanceRefs: [],
      coverageRefs: [],
      primaryActions: ["ask_tutor"],
      quality: { confidence: 0.7, sourceBacked: true, needsReview: false },
    });
    expect(html).toContain("Regenerate with LLM");
    expect(html).toContain("Understand conduction");
  });

  it("does not fall back to raw node metadata while a reference surface loads", () => {
    const html = renderViewer({
      id: "obj_2",
      nodeType: "objective",
      labels: ["Objective"],
      properties: { title: "Explain convection", internalDebugId: "debug_secret" },
    });
    expect(html).toContain("Loading reference surface");
    expect(html).not.toContain("debug_secret");
  });
});
