import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import katex from "katex";
import type { GraphCanvasNode, ReferenceBlock, ReferenceSurface } from "@studyagent/schemas";
import { learnerFacingSurfaceStatus } from "@studyagent/schemas";

interface FullPanelViewerProps {
  notebookId: string;
  node: GraphCanvasNode;
  onClose: () => void;
  onLaunchTutor?: (node: GraphCanvasNode) => void;
  onShowProvenance?: (node: GraphCanvasNode) => void;
  onDraftTutorPrompt?: (prompt: string, node: GraphCanvasNode) => void;
}

export const FullPanelViewer: React.FC<FullPanelViewerProps> = ({ notebookId, node, onClose, onLaunchTutor, onShowProvenance, onDraftTutorPrompt }) => {
  if (!node) return null;
  const [regenInstruction, setRegenInstruction] = React.useState("");
  const [showRegenOptions, setShowRegenOptions] = React.useState(false);
  const sourceNodeId =
    node.nodeType === "weak_concept" && typeof node.properties.conceptId === "string"
      ? node.properties.conceptId
      : node.id;

  const { data: referenceSurface, isLoading: isReferenceSurfaceLoading, isError: isReferenceSurfaceError } = useQuery({
    queryKey: ["reference-surface", notebookId, sourceNodeId],
    queryFn: async (): Promise<ReferenceSurface> => {
      const response = await fetch(`/api/v1/notebooks/${notebookId}/nodes/${sourceNodeId}/reference-surface`);
      if (!response.ok) {
        throw new Error(`Failed to load reference surface (${response.status})`);
      }
      return (await response.json()) as ReferenceSurface;
    },
  });
  const queryClient = useQueryClient();

  const title =
    (typeof node.properties.title === "string" ? node.properties.title : null) ??
    (typeof node.properties.canonicalName === "string" ? node.properties.canonicalName : null) ??
    (typeof node.properties.canonical_name === "string" ? node.properties.canonical_name : null) ??
    node.id.slice(0, 12);
  const regeneratePrompt = referenceSurface ? buildRegenerationPrompt(referenceSurface) : null;
  const sourceFileUrl =
    referenceSurface?.surfaceType === "source"
      ? `/api/v1/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(referenceSurface.nodeRef.refId)}/file`
      : null;
  const sourceExtractedUrl =
    referenceSurface?.surfaceType === "source"
      ? `/api/v1/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(referenceSurface.nodeRef.refId)}/extracted`
      : null;
  const regenerate = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/nodes/${encodeURIComponent(sourceNodeId)}/regenerate-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: referenceSurface?.surfaceType ?? node.nodeType,
          instruction: regenInstruction.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to regenerate reference (${response.status})`);
      }
      return response.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reference-surface", notebookId, sourceNodeId] }),
        queryClient.invalidateQueries({ queryKey: ["curriculum-outline", notebookId] }),
        queryClient.invalidateQueries({ queryKey: ["notebook-graph", notebookId] }),
      ]);
    },
  });
  const requestRegeneration = () => {
    if (!regeneratePrompt) return;
    regenerate.mutate();
  };
  const renderMarkdownBlock = (text: string) => <LearnerMarkdown text={text} />;
  const renderList = (items: unknown, empty: string, variant: "default" | "quiz" | "flashcard" = "default") => {
    if (!Array.isArray(items) || items.length === 0) return <div style={{ color: "#6b7280" }}>{empty}</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, index) => {
          const record = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          const itemTitle = String(record.title ?? record.front ?? record.prompt ?? record.problem ?? record.term ?? item);
          const body = record.body ?? record.back ?? record.answer ?? record.referenceAnswer ?? record.explanation ?? record.description;
          const options = Array.isArray(record.options) ? record.options : Array.isArray(record.choices) ? record.choices : [];
          return (
            <div key={`${itemTitle}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: variant === "default" ? 10 : 14, background: "#fff" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {variant !== "default" && (
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: variant === "quiz" ? "#eff6ff" : "#f0fdf4", color: variant === "quiz" ? "#1d4ed8" : "#15803d", display: "grid", placeItems: "center", flex: "0 0 auto", fontSize: 12, fontWeight: 800 }}>
                    {index + 1}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 750, color: "#111827" }}>{itemTitle}</div>
                  {options.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 6, marginTop: 8 }}>
                      {options.map((option, optionIndex) => (
                        <div key={optionIndex} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", color: "#374151", background: "#f9fafb" }}>
                          {String(option)}
                        </div>
                      ))}
                    </div>
                  )}
                  {body ? <div style={{ marginTop: 8, color: "#4b5563" }}>{String(body)}</div> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  const renderBlock = (block: ReferenceBlock) => {
    if (block.kind === "markdown" && typeof block.content === "string") {
      return renderMarkdownBlock(block.content);
    }
    if (block.kind === "summary" || block.kind === "definition") {
      return <div style={{ whiteSpace: "pre-wrap" }}>{String(block.content ?? "")}</div>;
    }
    if (block.kind === "formula_table" || block.kind === "comparison_table") {
      return <StructuredTable value={block.content} />;
    }
    if (block.kind === "citation_list") {
      return <CitationList value={block.content} />;
    }
    if (block.kind === "question_list" || block.kind === "flashcard_list") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {renderList(block.content, "No entries recorded.", block.kind === "question_list" ? "quiz" : "flashcard")}
          {onLaunchTutor && (
            <button
              type="button"
              onClick={() => onLaunchTutor(node)}
              style={{ alignSelf: "flex-start", padding: "6px 10px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}
            >
              {block.kind === "question_list" ? "Attempt in tutor chat" : "Review in tutor chat"}
            </button>
          )}
        </div>
      );
    }
    if (block.kind === "step_list") {
      return renderList(block.content, "No entries recorded.");
    }
    return <StructuredValue value={block.content} />;
  };
  const renderReferenceSurface = (surface: ReferenceSurface) => {
    if (surface.surfaceType === "source") {
      return <SourceDocumentViewer notebookId={notebookId} sourceId={surface.nodeRef.refId} title={surface.title} />;
    }
    return (
    <div style={{ maxWidth: 920, margin: "0 auto", color: "#111827", lineHeight: 1.55, fontSize: 14 }}>
      <main style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
              <span style={{ borderRadius: 999, background: surface.surfaceType === "artifact" ? "#fff7ed" : "#eff6ff", color: surface.surfaceType === "artifact" ? "#9a3412" : "#1d4ed8", padding: "2px 8px", fontSize: 11, fontWeight: 800, textTransform: "capitalize", flex: "0 0 auto" }}>
                {surface.surfaceType.replace(/_/g, " ")}
              </span>
              {surface.generation && <GenerationBadge generation={surface.generation} />}
              <div style={{ fontSize: 22, fontWeight: 850, letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{surface.title}</div>
            </div>
            {(() => {
              const label = learnerFacingSurfaceStatus({
                surfaceType: surface.surfaceType,
                status: surface.status,
                quality: surface.quality,
              })?.replace(/_/g, " ");
              return label ? <span style={{ color: "#6b7280", fontSize: 12 }}>{label}</span> : null;
            })()}
          </div>
          {regeneratePrompt && (
            <RegenerateControls
              isPending={regenerate.isPending}
              instruction={regenInstruction}
              showOptions={showRegenOptions}
              onInstructionChange={setRegenInstruction}
              onToggleOptions={() => setShowRegenOptions((value) => !value)}
              onRegenerate={requestRegeneration}
              errorMessage={regenerate.error instanceof Error ? regenerate.error.message : null}
            />
          )}
        </div>
        {surface.summary && <ReferenceSection title="Summary">{surface.summary}</ReferenceSection>}
        {surface.blocks.length > 0 ? (
          surface.blocks.map((block) => (
            <ReferenceSection key={block.id} title={block.title ?? block.kind.replace(/_/g, " ")}>
              {renderBlock(block)}
            </ReferenceSection>
          ))
        ) : (
          <ReferenceSection title="Reference">
            <div style={{ color: "#6b7280" }}>No durable reference content has been generated for this node yet.</div>
          </ReferenceSection>
        )}
      </main>
    </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "white" }}>
      <div
        style={{
          minHeight: 36,
          padding: "5px 10px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "#f9fafb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button
            onClick={onClose}
            title="Return to workspace"
            style={{
              background: "none",
              border: "1px solid #d1d5db",
              borderRadius: 5,
              padding: "2px 7px",
              cursor: "pointer",
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 700,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, fontWeight: 750, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
          {sourceFileUrl && sourceExtractedUrl && (
            <>
              <a href={sourceFileUrl} target="_blank" rel="noreferrer" style={{ padding: "3px 8px", color: "#1d4ed8", border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 5, fontSize: 11, fontWeight: 800, lineHeight: 1.4, textDecoration: "none" }}>
                Open original
              </a>
              <a href={sourceExtractedUrl} target="_blank" rel="noreferrer" style={{ padding: "3px 8px", color: "#374151", border: "1px solid #d1d5db", background: "#f3f4f6", borderRadius: 5, fontSize: 11, fontWeight: 800, lineHeight: 1.4, textDecoration: "none" }}>
                Extracted text
              </a>
            </>
          )}
          {onLaunchTutor && (
            <button
              onClick={() => onLaunchTutor(node)}
              style={{ padding: "3px 8px", background: "#2563eb", color: "#fff", border: "1px solid #2563eb", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 800, lineHeight: 1.4 }}
            >
              Teach me
            </button>
          )}
          {onShowProvenance && (
            <button
              onClick={() => onShowProvenance(node)}
              style={{ padding: "3px 8px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 750, lineHeight: 1.4 }}
            >
              Evidence
            </button>
          )}
          {regeneratePrompt && referenceSurface?.surfaceType !== "source" && (
            <button
              disabled={regenerate.isPending}
              onClick={() => setShowRegenOptions((value) => !value)}
              style={{ padding: "3px 8px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 5, cursor: regenerate.isPending ? "wait" : "pointer", fontSize: 11, fontWeight: 800, lineHeight: 1.4, opacity: regenerate.isPending ? 0.7 : 1 }}
            >
              Regenerate
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: referenceSurface?.surfaceType === "source" ? 0 : 16 }}>
        {referenceSurface ? (
          renderReferenceSurface(referenceSurface)
        ) : isReferenceSurfaceLoading ? (
          <ReferenceSurfaceState title={title} message="Loading reference surface." />
        ) : isReferenceSurfaceError ? (
          <ReferenceSurfaceState title={title} message="Reference surface is unavailable right now." />
        ) : (
          <ReferenceSurfaceState title={title} message="No durable reference content has been generated for this node yet." />
        )}
      </div>

      <div style={{ padding: referenceSurface ? 0 : 12, borderTop: referenceSurface ? "none" : "1px solid #e5e7eb", display: "flex", gap: 8 }}>
        {!referenceSurface && onLaunchTutor && (
          <button
            onClick={() => onLaunchTutor(node)}
            style={{ flex: 1, padding: "8px 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            Teach this
          </button>
        )}
      </div>
    </div>
  );
};

function ReferenceSurfaceState({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", color: "#111827", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "#6b7280" }}>{message}</div>
    </div>
  );
}

function GenerationBadge({ generation }: { generation: NonNullable<ReferenceSurface["generation"]> }) {
  const isAi = generation.mode === "ai";
  return (
    <span
      title={`${generation.label} generated${generation.generatedAt ? ` at ${generation.generatedAt}` : ""}`}
      style={{
        borderRadius: 999,
        background: isAi ? "#ecfeff" : "#f8fafc",
        color: isAi ? "#0e7490" : "#64748b",
        border: `1px solid ${isAi ? "#a5f3fc" : "#e2e8f0"}`,
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 850,
        letterSpacing: 0,
        flex: "0 0 auto",
      }}
    >
      {generation.label}
    </span>
  );
}

function ReferenceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 850, color: "#64748b", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0 }}>{title}</div>
      <div>{children}</div>
    </section>
  );
}

export default FullPanelViewer;

function RegenerateControls({
  isPending,
  instruction,
  showOptions,
  errorMessage,
  onInstructionChange,
  onToggleOptions,
  onRegenerate,
}: {
  isPending: boolean;
  instruction: string;
  showOptions: boolean;
  errorMessage: string | null;
  onInstructionChange: (value: string) => void;
  onToggleOptions: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={isPending}
          onClick={onRegenerate}
          style={{ padding: "5px 10px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", borderRadius: 6, fontWeight: 850, cursor: isPending ? "wait" : "pointer", fontSize: 12, opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Regenerating..." : "Regenerate with LLM"}
        </button>
        <button
          type="button"
          onClick={onToggleOptions}
          style={{ padding: "5px 10px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", borderRadius: 6, fontWeight: 800, cursor: "pointer", fontSize: 12 }}
        >
          {showOptions ? "Hide instructions" : "Add instruction"}
        </button>
      </div>
      {showOptions && (
        <textarea
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="Optional: make it more visual, add harder examples, focus on exam prep, include formulas..."
          style={{ width: "100%", minHeight: 58, resize: "vertical", border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, font: "inherit", fontSize: 13, lineHeight: 1.4 }}
        />
      )}
      {errorMessage && <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 750 }}>{errorMessage}</div>}
    </div>
  );
}

function SourceDocumentViewer({ notebookId, sourceId, title }: { notebookId: string; sourceId: string; title: string }) {
  const fileUrl = `/api/v1/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}/file`;
  return (
    <section style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#26384c" }}>
      <iframe
        title={`Original source: ${title}`}
        src={fileUrl}
        style={{ display: "block", width: "100%", flex: 1, minHeight: 0, border: 0, background: "#26384c" }}
      />
    </section>
  );
}

function buildRegenerationPrompt(surface: ReferenceSurface): string | null {
  const title = surface.title;
  const ref = `${surface.nodeRef.refType}:${surface.nodeRef.refId}`;
  if (surface.surfaceType === "artifact") {
    return [
      `Regenerate the selected artifact "${title}" using the LLM again.`,
      `Keep it source-grounded and update or replace the artifact connected to ${ref}.`,
      "Use the correct artifact format for its type: flashcards as cards, quizzes as questions, formula sheets with LaTeX, comparisons as tables, worked examples as steps.",
      "Make the content useful enough for a student to study from directly, not a placeholder.",
    ].join("\n");
  }
  if (surface.surfaceType === "concept" || surface.surfaceType === "wiki_page") {
    return [
      `Regenerate the selected ${surface.surfaceType === "concept" ? "concept wiki page" : "wiki page"} "${title}" using the LLM again.`,
      `Use ${ref} as the target page.`,
      "Format it as a strong study page: definition, intuition, formal details with LaTeX where useful, worked example, common confusions, quick self-check, and citations from source evidence.",
      "Prefer precise source-backed claims and explicitly mark anything that still needs evidence.",
    ].join("\n");
  }
  if (surface.surfaceType === "module" || surface.surfaceType === "curriculum" || surface.surfaceType === "objective" || surface.surfaceType === "objective_list" || surface.surfaceType === "session") {
    return [
      `Regenerate the selected ${surface.surfaceType} page "${title}" using the LLM again.`,
      `Use ${ref} as the target planning surface.`,
      "Format it for faster learning using the specific page type: curriculum path, module lesson, objective mastery page, objective sequence, or session plan. Use markdown tables and LaTeX formulas when useful.",
      "Keep it grounded in uploaded sources and the learner's current mastery state.",
    ].join("\n");
  }
  return null;
}

function CitationList({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return <div style={{ color: "#6b7280" }}>No citations recorded.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, index) => {
        const record = typeof row === "object" && row !== null ? (row as Record<string, unknown>) : {};
        const label = record.label ?? record.title ?? record.sourceTitle ?? record.refId ?? row;
        const locator = record.locator ?? record.page ?? record.section ?? record.chunkId;
        return (
          <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
            <div style={{ fontWeight: 750, color: "#111827" }}>{String(label)}</div>
            {locator ? <div style={{ marginTop: 3, color: "#6b7280", fontSize: 13 }}>{String(locator)}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function StructuredTable({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return <div style={{ color: "#6b7280" }}>No rows recorded.</div>;
  const records = rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row));
  if (records.length === 0) return <StructuredValue value={rows} />;
  const headers = Array.from(new Set(records.flatMap((row) => Object.keys(row)))).slice(0, 8);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 8px", color: "#6b7280" }}>
                {header.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row, index) => (
            <tr key={index}>
              {headers.map((header) => (
                <td key={header} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 8px", verticalAlign: "top" }}>
                  {String(row[header] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnerMarkdown({ text }: { text: string }) {
  const blocks = markdownBlocks(text);
  return (
    <div style={{ lineHeight: 1.65, color: "#10233d" }}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const size = block.level === 1 ? 26 : block.level === 2 ? 19 : 16;
          return (
            <div key={index} style={{ fontSize: size, fontWeight: 850, margin: index === 0 ? "0 0 10px" : "22px 0 8px", lineHeight: 1.25, color: "#0f2541" }}>
              {inlineMarkdown(block.text)}
            </div>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={index} style={{ margin: "10px 0", padding: "8px 12px", border: "1px solid #c7d2fe", borderRadius: 8, background: "#eef2ff", color: "#27346b", fontWeight: 650 }}>
              {inlineMarkdown(block.text)}
            </blockquote>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} style={{ margin: "8px 0 12px", paddingLeft: 22 }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ margin: "4px 0" }}>{inlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ordered_list") {
          return (
            <ol key={index} style={{ margin: "8px 0 12px", paddingLeft: 22 }}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} style={{ margin: "4px 0" }}>{inlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === "display_math") {
          return <FormulaBlock key={index} formula={block.text} />;
        }
        if (block.type === "table") {
          return <MarkdownTable key={index} rows={block.rows} />;
        }
        return (
          <p key={index} style={{ margin: "8px 0", maxWidth: "75ch" }}>
            {inlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] }
  | { type: "ordered_list"; items: string[] }
  | { type: "display_math"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

function markdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let orderedList: string[] = [];
  let table: string[][] = [];
  let math: string[] | null = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };
  const flushOrderedList = () => {
    if (!orderedList.length) return;
    blocks.push({ type: "ordered_list", items: orderedList });
    orderedList = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    if (rows.length) blocks.push({ type: "table", rows });
    table = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (math) {
      if (line.endsWith("$$")) {
        const close = line.slice(0, -2).trim();
        if (close) math.push(close);
        blocks.push({ type: "display_math", text: math.join("\n") });
        math = null;
      } else {
        math.push(rawLine);
      }
      continue;
    }
    if (!line) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushTable();
      continue;
    }
    if (line.startsWith("$$")) {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushTable();
      const rest = line.slice(2).trim();
      if (rest.endsWith("$$") && rest.length > 2) {
        blocks.push({ type: "display_math", text: rest.slice(0, -2).trim() });
      } else {
        math = rest ? [rest] : [];
      }
      continue;
    }
    if (isMarkdownTableLine(line)) {
      flushParagraph();
      flushList();
      flushOrderedList();
      table.push(line.split("|").map((cell) => cell.trim()).filter((cell, index, cells) => cell || index > 0 && index < cells.length - 1));
      continue;
    }
    flushTable();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }
    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push({ type: "quote", text: line.replace(/^>\s*/, "") });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushOrderedList();
      list.push(bullet[1]!.trim());
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushList();
      orderedList.push(numbered[1]!.trim());
      continue;
    }
    flushList();
    flushOrderedList();
    paragraph.push(line);
  }
  if (math) blocks.push({ type: "display_math", text: math.join("\n") });
  flushParagraph();
  flushList();
  flushOrderedList();
  flushTable();
  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+\$|\\\([^)]+\\\))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 4px" }}>{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$")) return <InlineFormula key={index} formula={part.slice(1, -1)} />;
    if (part.startsWith("\\(") && part.endsWith("\\)")) return <InlineFormula key={index} formula={part.slice(2, -2)} />;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function isMarkdownTableLine(line: string): boolean {
  return line.includes("|") && line.split("|").filter((part) => part.trim().length > 0).length >= 2;
}

function InlineFormula({ formula }: { formula: string }) {
  return <MathFormula formula={formula} displayMode={false} />;
}

function FormulaBlock({ formula }: { formula: string }) {
  return (
    <div style={{ margin: "12px 0", padding: "10px 12px", border: "1px solid #dbeafe", borderRadius: 8, background: "#f8fafc", overflowX: "auto", color: "#0f172a" }}>
      <MathFormula formula={formula} displayMode />
    </div>
  );
}

function MathFormula({ formula, displayMode }: { formula: string; displayMode: boolean }) {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(normalizeLatex(formula), {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
        output: "html",
      });
    } catch {
      return null;
    }
  }, [displayMode, formula]);
  if (!html) {
    return <code style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "0 4px", color: "#0f172a" }}>{formula}</code>;
  }
  return (
    <span
      className={displayMode ? "study-math-display" : "study-math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function normalizeLatex(formula: string): string {
  return formula
    .replace(/\\\\/g, "\\")
    .replace(/\\text\{\s*W\/m\s*\}/g, "\\mathrm{W/m}")
    .trim();
}

function MarkdownTable({ rows }: { rows: string[][] }) {
  if (!rows.length) return null;
  const [headers, ...body] = rows;
  return (
    <div style={{ overflowX: "auto", margin: "10px 0 14px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <thead>
          <tr>
            {(headers ?? []).map((header, index) => (
              <th key={index} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "7px 8px", color: "#334155", background: "#f8fafc", fontWeight: 850 }}>
                {inlineMarkdown(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {(headers ?? row).map((_, cellIndex) => (
                <td key={cellIndex} style={{ borderBottom: rowIndex === body.length - 1 ? 0 : "1px solid #f1f5f9", padding: "7px 8px", verticalAlign: "top" }}>
                  {inlineMarkdown(row[cellIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StructuredValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <div style={{ color: "#6b7280" }}>No data recorded.</div>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <div style={{ whiteSpace: "pre-wrap" }}>{String(value)}</div>;
  }
  if (Array.isArray(value)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value.map((item, index) => (
          <div key={index} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff" }}>
            <StructuredValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr)", gap: "6px 12px", margin: 0 }}>
        {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
          <React.Fragment key={key}>
            <dt style={{ fontWeight: 750, color: "#6b7280" }}>{key}</dt>
            <dd style={{ margin: 0 }}>
              <StructuredValue value={entry} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return <div>{String(value)}</div>;
}
