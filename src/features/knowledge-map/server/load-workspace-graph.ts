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
import { readNodePosition } from "@/features/graph-mutations/model/position";
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

function jsonObject(metadata: Json) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : null;
}

function metadataString(metadata: Json, key: string) {
  const value = jsonObject(metadata)?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function edgeTrace(
  metadata: Json,
): Pick<
  GraphEdge,
  | "origin"
  | "captureId"
  | "model"
  | "promptVersion"
  | "processingJobId"
  | "createdBy"
> {
  const explicitOrigin = metadataString(metadata, "origin");
  const model = metadataString(metadata, "model");
  const promptVersion = metadataString(metadata, "promptVersion");
  const processingJobId = metadataString(metadata, "processingJobId");

  return {
    origin:
      explicitOrigin === "ai" ||
      explicitOrigin === "user" ||
      explicitOrigin === "system"
        ? explicitOrigin
        : model || promptVersion || processingJobId
          ? ("ai" as const)
          : ("user" as const),
    captureId: metadataString(metadata, "captureId"),
    model,
    promptVersion,
    processingJobId,
    createdBy: metadataString(metadata, "createdBy"),
  };
}

const RECENT_CAPTURE_LIMIT = 60;
const SOURCE_NODE_LIMIT = RECENT_CAPTURE_LIMIT;
const SEMANTIC_NODE_LIMIT = 180;
const FOLDER_LIMIT = 240;
const TOPIC_LIMIT = 120;
const GRAPH_EDGE_LIMIT = 480;
const TOPIC_ASSIGNMENT_BATCH_SIZE = 30;
const MAX_TOPICS_PER_CAPTURE = 32;

function projectionNodeId(kind: "folder" | "capture" | "topic", id: string) {
  return `projection:${kind}:${id}`;
}

function uniqueRowsById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function chunks<T>(values: T[], size: number) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

export async function loadWorkspaceGraph(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  locale: Locale,
): Promise<GraphSnapshot | null> {
  // Establish one recent-capture boundary first. Folder, topic, source, and AI
  // projections below are all derived from this same material window.
  const [folderResult, captureResult, topicResult] = await Promise.all([
    supabase
      .from("folders")
      .select("id, parent_id, name, sort_order, created_at")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(FOLDER_LIMIT),
    supabase
      .from("captures")
      .select("id, folder_id, title, source_kind, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(RECENT_CAPTURE_LIMIT),
    supabase
      .from("contexts")
      .select("id, label, normalized_value, created_at")
      .eq("workspace_id", workspaceId)
      .eq("kind", "topic")
      .order("label", { ascending: true })
      .limit(TOPIC_LIMIT),
  ]);

  const folders = folderResult.error ? [] : (folderResult.data ?? []);
  const captures = captureResult.error ? [] : (captureResult.data ?? []);
  const topics = topicResult.error ? [] : (topicResult.data ?? []);
  const captureIds = captures.map((capture) => capture.id);

  const [sourceNodeResult, semanticNodeResult] = captureIds.length
    ? await Promise.all([
        supabase
          .from("nodes")
          .select(
            "id, capture_id, kind, title, summary, evidence_snippet, confidence, metadata, created_at",
          )
          .eq("workspace_id", workspaceId)
          .eq("kind", "source_summary")
          .in("capture_id", captureIds)
          .order("created_at", { ascending: false })
          .limit(SOURCE_NODE_LIMIT),
        supabase
          .from("nodes")
          .select(
            "id, capture_id, kind, title, summary, evidence_snippet, confidence, metadata, created_at",
          )
          .eq("workspace_id", workspaceId)
          .neq("kind", "source_summary")
          .in("capture_id", captureIds)
          .order("created_at", { ascending: false })
          .limit(SEMANTIC_NODE_LIMIT),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  const nodes = uniqueRowsById([
    ...(sourceNodeResult.error ? [] : (sourceNodeResult.data ?? [])),
    ...(semanticNodeResult.error ? [] : (semanticNodeResult.data ?? [])),
  ]);
  const topicAssignmentResults = await Promise.all(
    chunks(captureIds, TOPIC_ASSIGNMENT_BATCH_SIZE).map((captureIdBatch) =>
      supabase
        .from("capture_topics")
        .select("capture_id, topic_context_id")
        .eq("workspace_id", workspaceId)
        .in("capture_id", captureIdBatch)
        .limit(captureIdBatch.length * MAX_TOPICS_PER_CAPTURE),
    ),
  );
  const topicAssignments = topicAssignmentResults.flatMap((result) =>
    result.error ? [] : (result.data ?? []),
  );

  if (!nodes.length && !folders.length && !captures.length && !topics.length) return null;

  const nodeIds = nodes.map((node) => node.id);
  const { data: edges } = nodeIds.length
    ? await supabase
        .from("edges")
        .select(
          "id, source_node_id, target_node_id, kind, label, confidence, evidence_snippet, metadata",
        )
        .eq("workspace_id", workspaceId)
        .in("source_node_id", nodeIds)
        .limit(GRAPH_EDGE_LIMIT)
    : { data: [] };

  const captureCreatedAtById = new Map(
    captures.map((capture) => [capture.id, capture.created_at] as const),
  );

  const graphNodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    eyebrow: nodeKindLabel(locale, node.kind),
    nodeKind: node.kind,
    summary: node.summary ?? "",
    tone: nodeTone(node.kind),
    captureId: node.capture_id ?? undefined,
    captureCreatedAt: node.capture_id
      ? captureCreatedAtById.get(node.capture_id)
      : undefined,
    confidenceLabel:
      typeof node.confidence === "number" ? `${Math.round(node.confidence * 100)}%` : undefined,
    evidenceSnippet: node.evidence_snippet ?? evidenceSnippet(node.metadata),
    savedPosition: readNodePosition(node.metadata),
  }));

  const sourceNodeByCaptureId = new Map(
    nodes
      .filter((node) => node.kind === "source_summary" && node.capture_id)
      .map((node) => [node.capture_id as string, node.id]),
  );
  const folderGraphIdById = new Map(
    folders.map((folder) => [folder.id, projectionNodeId("folder", folder.id)]),
  );

  graphNodes.push(
    ...folders.map((folder) => ({
      id: projectionNodeId("folder", folder.id),
      title: folder.name,
      eyebrow: locale === "ko" ? "폴더" : "Folder",
      nodeKind: "folder",
      summary: locale === "ko" ? "사용자가 정리한 자료 폴더" : "User-organized material folder",
      tone: "context" as const,
    })),
    ...topics.map((topic) => ({
      id: projectionNodeId("topic", topic.id),
      title: topic.label,
      eyebrow: locale === "ko" ? "주제" : "Topic",
      nodeKind: "topic",
      summary: locale === "ko" ? "사용자가 지정한 자료 주제" : "User-assigned material topic",
      tone: "topic" as const,
    })),
    ...captures
      .filter((capture) => !sourceNodeByCaptureId.has(capture.id))
      .map((capture) => ({
        id: projectionNodeId("capture", capture.id),
        title:
          capture.title?.trim() ||
          (locale === "ko" ? "제목 없는 자료" : "Untitled material"),
        eyebrow: nodeKindLabel(locale, "source_summary"),
        nodeKind: "source",
        summary:
          locale === "ko"
            ? "원문이 보존된 자료입니다. 자료 상세에서 전체 내용을 확인할 수 있습니다."
            : "Saved source material. Open the material detail to read the full content.",
        tone: "source" as const,
        captureId: capture.id,
        captureCreatedAt: capture.created_at,
      })),
  );

  const validNodeIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges: GraphEdge[] = (edges ?? [])
    .filter(
      (edge) =>
        validNodeIds.has(edge.source_node_id) &&
        validNodeIds.has(edge.target_node_id),
    )
    .map((edge) => {
      const trace = edgeTrace(edge.metadata);
      return {
        id: edge.id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
        tone: edgeTone(edge.kind),
        label: edge.label ?? undefined,
        kind: edge.kind,
        confidence:
          typeof edge.confidence === "number" ? edge.confidence : undefined,
        evidenceSnippet:
          edge.evidence_snippet ?? evidenceSnippet(edge.metadata),
        ...trace,
      };
    });

  for (const folder of folders) {
    const sourceNodeId = folderGraphIdById.get(folder.parent_id ?? "");
    const targetNodeId = folderGraphIdById.get(folder.id);
    if (!sourceNodeId || !targetNodeId) continue;
    graphEdges.push({
      id: `projection:folder-parent:${folder.id}`,
      sourceNodeId,
      targetNodeId,
      tone: "context",
      label: locale === "ko" ? "하위 폴더" : "Subfolder",
      kind: "contains",
      origin: "system",
    });
  }

  for (const capture of captures) {
    if (!capture.folder_id) continue;
    const sourceNodeId = folderGraphIdById.get(capture.folder_id);
    const targetNodeId =
      sourceNodeByCaptureId.get(capture.id) ??
      projectionNodeId("capture", capture.id);
    if (!sourceNodeId || !validNodeIds.has(targetNodeId)) continue;
    graphEdges.push({
      id: `projection:folder-capture:${capture.folder_id}:${capture.id}`,
      sourceNodeId,
      targetNodeId,
      tone: "context",
      label: locale === "ko" ? "포함" : "Contains",
      kind: "contains",
      origin: "system",
      captureId: capture.id,
    });
  }

  const topicGraphIdById = new Map(
    topics.map((topic) => [topic.id, projectionNodeId("topic", topic.id)]),
  );
  for (const assignment of topicAssignments) {
    const sourceNodeId = topicGraphIdById.get(assignment.topic_context_id);
    const targetNodeId =
      sourceNodeByCaptureId.get(assignment.capture_id) ??
      projectionNodeId("capture", assignment.capture_id);
    if (!sourceNodeId || !validNodeIds.has(targetNodeId)) continue;
    graphEdges.push({
      id: `projection:topic-capture:${assignment.topic_context_id}:${assignment.capture_id}`,
      sourceNodeId,
      targetNodeId,
      tone: "topic",
      label: locale === "ko" ? "주제" : "Topic",
      kind: "relates_to",
      origin: "system",
      captureId: assignment.capture_id,
    });
  }

  return {
    id: `workspace-${workspaceId}`,
    workspaceId,
    source: "workspace",
    generatedAt: new Date().toISOString(),
    nodes: graphNodes,
    edges: graphEdges,
  };
}
