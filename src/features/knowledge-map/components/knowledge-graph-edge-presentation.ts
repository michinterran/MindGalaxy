import type { GraphEdge } from "@/features/knowledge-map/model/graph";

/**
 * Origin is encoded with line rhythm so the graph remains understandable
 * without relying on color perception.
 */
export function edgeOriginStrokeDasharray(origin: GraphEdge["origin"]) {
  if (origin === "user") return undefined;
  if (origin === "ai") return "9 6";
  return "2 6";
}
