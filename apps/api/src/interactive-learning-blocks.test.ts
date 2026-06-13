import { describe, expect, it } from "vitest";
import type { AppContext } from "./context.js";
import {
  actionAllowedForBlock,
  buildInteractiveBlocksForSurface,
  findInteractiveBlock,
} from "./interactive-learning-blocks.js";

const NB = "nb_1";
const now = new Date("2026-06-08T00:00:00.000Z");

function ctxFor(): AppContext {
  return {
    db: {
      db: {
        select() {
          return {
            from() {
              return {
                where() {
                  return {
                    orderBy() {
                      return {
                        limit() {
                          return Promise.resolve([]);
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      },
    },
    env: {},
  } as unknown as AppContext;
}

describe("interactive learning blocks", () => {
  it("builds quiz and evidence explorer blocks for ready quiz artifacts", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_quiz" },
      title: "Quiz",
      artifact: {
        id: "art_quiz",
        notebookId: NB,
        artifactType: "quiz",
        title: "Thermo quiz",
        status: "ready",
        payloadJson: {
          prompt: "Practice heat transfer.",
          questions: [{ id: "q1", prompt: "What is conduction?" }],
          conceptIds: ["concept_1"],
        },
        sourceChunkIds: ["chunk_1"],
      },
      evidenceRefs: [
        {
          id: "chunk_1",
          kind: "chunk",
          visibility: "learner",
          label: "Source excerpt",
          text: "Heat moves by contact.",
          confidence: null,
          status: null,
          chunkType: "paragraph",
          pageStart: 1,
          pageEnd: 1,
          sourceId: "src_1",
          sourceTitle: "Textbook",
          metadata: {},
          statementKind: "source_backed",
        },
      ],
    });

    const quiz = findInteractiveBlock(blocks, "interactive_quiz_art_quiz");
    expect(quiz?.kind).toBe("quiz");
    expect(quiz?.allowedActions).toContain("quiz.answer_submitted");
    expect(quiz?.content).toEqual({
      questions: [{ id: "q1", prompt: "What is conduction?" }],
    });
    const quizWithoutIds = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_quiz_no_ids" },
      title: "Quiz",
      artifact: {
        id: "art_quiz_no_ids",
        notebookId: NB,
        artifactType: "quiz",
        title: "Untitled quiz",
        status: "ready",
        payloadJson: {
          questions: [{ prompt: "What is conduction?" }],
        },
      },
    });
    const normalizedQuiz = findInteractiveBlock(quizWithoutIds, "interactive_quiz_art_quiz_no_ids");
    expect(normalizedQuiz?.content).toEqual({
      questions: [{ prompt: "What is conduction?", id: "q_0" }],
    });
    expect(blocks.some((block) => block.kind === "evidence_explorer")).toBe(true);
  });

  it("normalizes quiz question aliases before sending content to MCP renderers", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_quiz_aliases" },
      title: "Quiz",
      artifact: {
        id: "art_quiz_aliases",
        notebookId: NB,
        artifactType: "quiz",
        title: "Heat transfer quiz",
        status: "ready",
        payloadJson: {
          questions: [
            {
              question: "What is the driving force for heat conduction?",
              options: ["Temperature difference", "Density", "Color", "Mass"],
              answer: "Temperature difference",
            },
          ],
        },
      },
    });

    const quiz = findInteractiveBlock(blocks, "interactive_quiz_art_quiz_aliases");
    expect(quiz?.content).toEqual({
      questions: [
        {
          id: "q_0",
          question: "What is the driving force for heat conduction?",
          prompt: "What is the driving force for heat conduction?",
          options: ["Temperature difference", "Density", "Color", "Mass"],
          choices: ["Temperature difference", "Density", "Color", "Mass"],
          answer: "Temperature difference",
        },
      ],
    });
  });

  it("upgrades legacy generic quiz prompts before sending content to MCP renderers", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_quiz_legacy" },
      title: "Quiz",
      artifact: {
        id: "art_quiz_legacy",
        notebookId: NB,
        artifactType: "quiz",
        title: "Heat transfer quiz",
        status: "ready",
        payloadJson: {
          questions: [
            {
              id: "q1",
              prompt: "How would you explain Conduction Rate Equation in your own words?",
              referenceAnswer:
                "It relates conduction heat rate to thermal conductivity, area, temperature difference, and thickness.",
              conceptId: "concept_conduction_rate",
            },
          ],
        },
      },
    });

    const quiz = findInteractiveBlock(blocks, "interactive_quiz_art_quiz_legacy");
    expect(quiz?.content).toEqual({
      questions: [
        expect.objectContaining({
          id: "q1",
          prompt: "Which statement best describes Conduction Rate Equation?",
          choices: expect.arrayContaining([
            "It relates conduction heat rate to thermal conductivity, area, temperature difference, and thickness",
          ]),
          answer:
            "It relates conduction heat rate to thermal conductivity, area, temperature difference, and thickness",
          referenceAnswer:
            "It relates conduction heat rate to thermal conductivity, area, temperature difference, and thickness",
        }),
      ],
    });
  });

  it("hides interactive quiz blocks for draft artifacts", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_draft" },
      title: "Draft quiz",
      artifact: {
        id: "art_draft",
        notebookId: NB,
        artifactType: "quiz",
        title: "Draft quiz",
        status: "draft",
        payloadJson: { questions: [{ id: "q1", prompt: "?" }] },
      },
    });

    expect(blocks.some((block) => block.kind === "quiz")).toBe(false);
  });

  it("builds flashcard deck blocks with review canonical state", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_cards" },
      title: "Cards",
      artifact: {
        id: "art_cards",
        notebookId: NB,
        artifactType: "flashcards",
        title: "Key terms",
        status: "ready",
        payloadJson: {
          cards: [{ id: "card_1", front: "Term", back: "Definition" }],
          reviews: [{ cardId: "card_1", result: "good", reviewedAt: now.toISOString() }],
        },
      },
    });

    const deck = findInteractiveBlock(blocks, "interactive_flashcards_art_cards");
    expect(deck?.kind).toBe("flashcard_deck");
    expect(deck?.canonicalState).toEqual(
      expect.objectContaining({
        reviewedCardIds: ["card_1"],
      }),
    );
    expect(actionAllowedForBlock(deck!, "flashcard.review_rated")).toBe(true);
  });

  it("builds comparison blocks for ready comparison_page artifacts", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "artifact",
      nodeRef: { refType: "artifact", refId: "art_comp" },
      title: "Eigenvalue vs eigenvector",
      artifact: {
        id: "art_comp",
        notebookId: NB,
        artifactType: "comparison_page",
        title: "Eigenvalue vs eigenvector",
        status: "ready",
        payloadJson: {
          leftTitle: "Eigenvalue",
          rightTitle: "Eigenvector",
          comparisonRows: [{ dimension: "Type", left: "Scalar", right: "Vector" }],
        },
      },
    });

    const comparison = findInteractiveBlock(blocks, "interactive_comparison_art_comp");
    expect(comparison?.kind).toBe("comparison");
    expect(comparison?.allowedActions).toContain("surface.completed");
  });

  it("adds evidence explorer blocks for heuristic concept surfaces", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "concept",
      nodeRef: { refType: "concept", refId: "concept_1" },
      title: "Conduction",
      evidenceRefs: [
        {
          id: "chunk_1",
          kind: "chunk",
          visibility: "learner",
          label: "Source excerpt",
          text: "Heat moves by contact.",
          confidence: null,
          status: null,
          chunkType: "paragraph",
          pageStart: 1,
          pageEnd: 1,
          sourceId: "src_1",
          sourceTitle: "Textbook",
          metadata: {},
          statementKind: "source_backed",
        },
      ],
    });

    expect(blocks.map((block) => block.kind)).toEqual(["evidence_explorer"]);
  });

  it("skips default surface blocks when includeSurfaceDefaults is false", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "concept",
      nodeRef: { refType: "concept", refId: "concept_1" },
      title: "Conduction",
      includeSurfaceDefaults: false,
      evidenceRefs: [
        {
          id: "chunk_1",
          kind: "chunk",
          visibility: "learner",
          label: "Source excerpt",
          text: "Heat moves by contact.",
          confidence: null,
          status: null,
          chunkType: "paragraph",
          pageStart: 1,
          pageEnd: 1,
          sourceId: "src_1",
          sourceTitle: "Textbook",
          metadata: {},
          statementKind: "source_backed",
        },
      ],
    });

    expect(blocks).toEqual([]);
  });

  it("does not auto-add simulations; LLM polish chooses interactive blocks", async () => {
    const blocks = await buildInteractiveBlocksForSurface(ctxFor(), {
      notebookId: NB,
      surfaceType: "concept",
      nodeRef: { refType: "concept", refId: "concept_quadratic" },
      title: "Quadratic functions",
      evidenceRefs: [
        {
          id: "chunk_math",
          kind: "chunk",
          visibility: "learner",
          label: "Source excerpt",
          text: "A quadratic function can be plotted as a parabola using y = x^2.",
          confidence: null,
          status: null,
          chunkType: "paragraph",
          pageStart: 1,
          pageEnd: 1,
          sourceId: "src_1",
          sourceTitle: "Textbook",
          metadata: {},
          statementKind: "source_backed",
        },
      ],
    });

    expect(blocks.some((block) => block.kind === "simulation")).toBe(false);
  });
});
