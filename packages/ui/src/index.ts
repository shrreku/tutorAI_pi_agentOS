import type { GraphNode } from "@studyagent/schemas";

export function getNodeDisplayLabel(node: GraphNode): string {
  return node.title;
}
