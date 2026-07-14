import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  GraphTone,
} from "@/features/knowledge-map/model/graph";
import type { Database, Json } from "@/types/database";
import type { EdgeKind, NodeKind } from "@/types/domain";
import { nodeKindLabel } from "@/lib/i18n/labels";
import type { Locale } from "@/lib/i18n";

function nodeTone(kind: NodeKind): GraphTone {
  if (kind === "source_summary") return "source";
  if (kind === "task") return "action";
  if (kind === "claim") return "evidence";
  return "topic";
}

function edgeTone(kind: EdgeKind): GraphTone {
  if (kind === "supports" || kind === "derived_from") return "evidence";
  if (kind === "follows") return "action";
  return "context";
}

function evidenceSnippet(metadata: Json): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const evidence = metadata.evidence;

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return undefined;
  }

  return typeof evidence.quote === "string" ? evidence.quote : undefined;
}

export async function loadWorkspaceGraph(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  locale: Locale,
): Promise<GraphSnapshot | null> {
  const { data: nodes, error: nodesError } = await supabase
    .from("nodes")
    .select("id, kind, title, summary, evidence_snippet, confidence, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(80);

  if (nodesError || !nodes?.length) {
    return null;
  }

  const nodeIds = nodes.map((node) => node.id);
  const { data: edges } = await supabase
    .from("edges")
    .select("id, source_node_id, target_node_id, kind, label")
    .eq("workspace_id", workspaceId)
    .in("source_node_id", nodeIds)
    .limit(160);

  const graphNodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    eyebrow: nodeKindLabel(locale, node.kind),
    nodeKind: node.kind,
    summary: node.summary ?? "",
    tone: nodeTone(node.kind),
    confidenceLabel:
      typeof node.confidence === "number" ? `${Math.round(node.confidence * 100)}%` : undefined,
    evidenceSnippet: node.evidence_snippet ?? evidenceSnippet(node.metadata),
  }));

  const validNodeIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges: GraphEdge[] = (edges ?? [])
    .filter(
      (edge) =>
        validNodeIds.has(edge.source_node_id) &&
        validNodeIds.has(edge.target_node_id),
    )
    .map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source_node_id,
      targetNodeId: edge.target_node_id,
      tone: edgeTone(edge.kind),
      label: edge.label ?? undefined,
    }));

  return {
    id: `workspace-${workspaceId}`,
    workspaceId,
    source: "workspace",
    generatedAt: new Date().toISOString(),
    nodes: graphNodes,
    edges: graphEdges,
  };
}
