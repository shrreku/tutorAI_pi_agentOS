export type CanonicalGraphRelationKind =
  | "depends_on"
  | "supports"
  | "example_of"
  | "contradicts"
  | "covers"
  | "elaborates"
  | "cites"
  | "supersedes"
  | "contains"
  | "plans"
  | "has_topic"
  | "contains_concept"
  | "contains_page"
  | "derived_from"
  | "next_objective";

export type GraphRelationSemantics = {
  canonical: CanonicalGraphRelationKind;
  postgresType: string;
  neo4jType: string;
  direction: "source_to_target" | "target_to_source" | "bidirectional";
  learnerVisible: boolean;
  learnerLabel: string | null;
  searchRole: "prerequisite" | "supporting" | "contradicting" | "citation" | "structure" | "hidden";
  sourceOwned: boolean;
};

const registry: Record<CanonicalGraphRelationKind, GraphRelationSemantics> = {
  depends_on: { canonical: "depends_on", postgresType: "depends_on", neo4jType: "DEPENDS_ON", direction: "source_to_target", learnerVisible: true, learnerLabel: "depends on", searchRole: "prerequisite", sourceOwned: true },
  supports: { canonical: "supports", postgresType: "supports", neo4jType: "COVERS", direction: "source_to_target", learnerVisible: true, learnerLabel: "supports", searchRole: "supporting", sourceOwned: true },
  example_of: { canonical: "example_of", postgresType: "example_of", neo4jType: "DERIVED_FROM", direction: "source_to_target", learnerVisible: true, learnerLabel: "example of", searchRole: "supporting", sourceOwned: true },
  contradicts: { canonical: "contradicts", postgresType: "contradicts", neo4jType: "CONTRADICTS", direction: "bidirectional", learnerVisible: false, learnerLabel: null, searchRole: "contradicting", sourceOwned: true },
  covers: { canonical: "covers", postgresType: "covers", neo4jType: "COVERS", direction: "source_to_target", learnerVisible: true, learnerLabel: "covers", searchRole: "supporting", sourceOwned: true },
  elaborates: { canonical: "elaborates", postgresType: "elaborates", neo4jType: "DERIVED_FROM", direction: "source_to_target", learnerVisible: true, learnerLabel: "elaborates", searchRole: "supporting", sourceOwned: true },
  cites: { canonical: "cites", postgresType: "cites", neo4jType: "CITES", direction: "source_to_target", learnerVisible: true, learnerLabel: "cites", searchRole: "citation", sourceOwned: true },
  supersedes: { canonical: "supersedes", postgresType: "supersedes", neo4jType: "SUPERSEDES", direction: "source_to_target", learnerVisible: false, learnerLabel: null, searchRole: "hidden", sourceOwned: true },
  contains: { canonical: "contains", postgresType: "contains", neo4jType: "CONTAINS", direction: "source_to_target", learnerVisible: true, learnerLabel: "contains", searchRole: "structure", sourceOwned: false },
  plans: { canonical: "plans", postgresType: "plans", neo4jType: "PLANS", direction: "source_to_target", learnerVisible: true, learnerLabel: "plans", searchRole: "structure", sourceOwned: false },
  has_topic: { canonical: "has_topic", postgresType: "has_topic", neo4jType: "HAS_TOPIC", direction: "source_to_target", learnerVisible: true, learnerLabel: "has topic", searchRole: "structure", sourceOwned: true },
  contains_concept: { canonical: "contains_concept", postgresType: "contains_concept", neo4jType: "CONTAINS_CONCEPT", direction: "source_to_target", learnerVisible: true, learnerLabel: "includes concept", searchRole: "structure", sourceOwned: true },
  contains_page: { canonical: "contains_page", postgresType: "contains_page", neo4jType: "CONTAINS_PAGE", direction: "source_to_target", learnerVisible: true, learnerLabel: "includes page", searchRole: "structure", sourceOwned: true },
  derived_from: { canonical: "derived_from", postgresType: "derived_from", neo4jType: "DERIVED_FROM", direction: "source_to_target", learnerVisible: false, learnerLabel: null, searchRole: "citation", sourceOwned: true },
  next_objective: { canonical: "next_objective", postgresType: "next_objective", neo4jType: "NEXT_OBJECTIVE", direction: "source_to_target", learnerVisible: true, learnerLabel: "next objective", searchRole: "structure", sourceOwned: false },
};

const aliases = new Map<string, CanonicalGraphRelationKind>(
  Object.values(registry).flatMap((entry) => [
    [entry.canonical, entry.canonical],
    [entry.neo4jType, entry.canonical],
    [entry.postgresType, entry.canonical],
  ]),
);

export function normalizeGraphRelationKind(value: string): CanonicalGraphRelationKind | null {
  const trimmed = value.trim();
  return aliases.get(trimmed) ?? aliases.get(trimmed.toUpperCase()) ?? null;
}

export function graphRelationSemantics(value: string): GraphRelationSemantics | null {
  const kind = normalizeGraphRelationKind(value);
  return kind ? registry[kind] : null;
}

export function learnerVisibleRelationLabel(value: string): string | null {
  const semantics = graphRelationSemantics(value);
  return semantics?.learnerVisible ? semantics.learnerLabel : null;
}

export function allGraphRelationSemantics(): GraphRelationSemantics[] {
  return Object.values(registry);
}
