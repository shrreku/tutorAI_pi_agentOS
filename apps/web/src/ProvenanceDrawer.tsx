import React, { useEffect, useState } from "react";

interface ClaimRef {
  id: string;
  claimType: string;
  claimText: string;
  confidence: number;
  status: string;
}

interface ChunkRef {
  id: string;
  chunkType: string;
  text: string;
  pageStart?: number | null;
  pageEnd?: number | null;
}

interface ProvenanceData {
  nodeId: string;
  entityType: string | null;
  entity: Record<string, unknown> | null;
  claimRefs: ClaimRef[];
  chunkRefs: ChunkRef[];
}

interface ProvenanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string | undefined;
  nodeTitle: string | undefined;
  nodeType: string | undefined;
  notebookId: string | undefined;
  confidence: number | undefined;
  metadata: Record<string, unknown> | undefined;
  isDeveloperMode?: boolean;
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  concept: { bg: "#dbeafe", text: "#1d4ed8" },
  source: { bg: "#d1fae5", text: "#065f46" },
  artifact: { bg: "#fce7f3", text: "#9d174d" },
  claim: { bg: "#f5f3ff", text: "#6d28d9" },
  wiki_page: { bg: "#e0f2fe", text: "#0369a1" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  accepted: { bg: "#d1fae5", text: "#065f46" },
  candidate: { bg: "#fef3c7", text: "#92400e" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
  active: { bg: "#d1fae5", text: "#065f46" },
  draft: { bg: "#f3f4f6", text: "#374151" },
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.8 ? "#10b981" : value > 0.5 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

export const ProvenanceDrawer: React.FC<ProvenanceDrawerProps> = ({
  isOpen,
  onClose,
  nodeId,
  nodeTitle,
  nodeType,
  notebookId,
  confidence,
  metadata,
  isDeveloperMode = false,
}) => {
  const [provenance, setProvenance] = useState<ProvenanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !nodeId || !notebookId) {
      setProvenance(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    fetch(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/nodes/${encodeURIComponent(nodeId)}/provenance`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ProvenanceData) => setProvenance(data))
      .catch((err: Error) => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, nodeId, notebookId]);

  if (!isOpen) return null;

  const badge = BADGE_COLORS[nodeType ?? ""] ?? { bg: "#f3f4f6", text: "#374151" };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        backgroundColor: "white",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        animation: "slideIn 180ms ease-out",
      }}
    >
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ background: badge.bg, color: badge.text, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>
              {(nodeType ?? "node").replace(/_/g, " ")}
            </span>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#111827" }}>Provenance</h2>
          </div>
          {nodeTitle && <div style={{ fontSize: 13, color: "#6b7280" }}>{nodeTitle}</div>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

        {/* Confidence (from node properties) */}
        {confidence !== undefined && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>CONFIDENCE</div>
            <ConfidenceBar value={confidence} />
          </div>
        )}

        {loading && (
          <div style={{ color: "#6b7280", fontSize: 13, padding: "20px 0" }}>Loading provenance data…</div>
        )}

        {fetchError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 10, fontSize: 12, color: "#991b1b", marginBottom: 12 }}>
            Could not load provenance: {fetchError}
          </div>
        )}

        {provenance && !loading && (
          <>
            {/* Source claims */}
            {provenance.claimRefs.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                  SOURCE CLAIMS ({provenance.claimRefs.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {provenance.claimRefs.map((claim) => {
                    const sc = STATUS_COLORS[claim.status] ?? { bg: "#f3f4f6", text: "#374151" };
                    return (
                      <div key={claim.id} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "capitalize" }}>
                            {claim.claimType.replace(/_/g, " ")}
                          </span>
                          <span style={{ background: sc.bg, color: sc.text, padding: "1px 6px", borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>
                            {claim.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#1f2937", lineHeight: 1.5, marginBottom: 4 }}>{claim.claimText}</div>
                        <ConfidenceBar value={claim.confidence} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Source chunks */}
            {provenance.chunkRefs.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                  SOURCE CHUNKS ({provenance.chunkRefs.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {provenance.chunkRefs.map((chunk) => (
                    <div key={chunk.id} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                          {chunk.chunkType}
                        </span>
                        {(chunk.pageStart != null) && (
                          <span style={{ fontSize: 10, color: "#9ca3af" }}>
                            p.{chunk.pageStart}{chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `–${chunk.pageEnd}` : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, fontStyle: "italic" }}>
                        "{chunk.text}{chunk.text.length >= 400 ? "…" : ""}"
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {provenance.claimRefs.length === 0 && provenance.chunkRefs.length === 0 && (
              <div style={{ color: "#9ca3af", fontSize: 13, padding: "12px 0" }}>
                No source claims or chunks found for this node.
                {!provenance.entityType && " (Node may exist only in the graph projection.)"}
              </div>
            )}
          </>
        )}

        {/* Developer mode: raw IDs and metadata */}
        {isDeveloperMode && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>DEVELOPER INFO</div>
            <pre style={{ background: "#1f2937", color: "#f3f4f6", padding: 12, borderRadius: 6, fontSize: 10, overflowX: "auto", margin: 0, lineHeight: 1.5 }}>
              {JSON.stringify({ nodeId, nodeType, entityType: provenance?.entityType, entity: provenance?.entity, ...(metadata ?? {}) }, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e7eb" }}>
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "7px 12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#1f2937" }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
