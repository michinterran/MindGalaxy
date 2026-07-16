import { canMutateGraphNode } from "@/features/knowledge-map/model/graph";

export type MindMapBranchState = {
  collapsedNodeIds: ReadonlySet<string>;
  expandedNodeIds: ReadonlySet<string>;
};

export function canPersistMindMapNodePosition({
  hasPersistenceHandler,
  isDemo,
  nodeId,
}: {
  hasPersistenceHandler: boolean;
  isDemo: boolean;
  nodeId: string;
}) {
  return hasPersistenceHandler && !isDemo && canMutateGraphNode(nodeId);
}

export function isMindMapActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

const KEYBOARD_NUDGE_DISTANCE = 24;

export function mindMapKeyboardNudge(key: string, altKey: boolean) {
  if (!altKey) return null;

  if (key === "ArrowLeft") return { x: -KEYBOARD_NUDGE_DISTANCE, y: 0 };
  if (key === "ArrowRight") return { x: KEYBOARD_NUDGE_DISTANCE, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -KEYBOARD_NUDGE_DISTANCE };
  if (key === "ArrowDown") return { x: 0, y: KEYBOARD_NUDGE_DISTANCE };

  return null;
}

export function toggleMindMapBranch(
  nodeId: string,
  isExpanded: boolean,
  state: MindMapBranchState,
): MindMapBranchState {
  const expandedNodeIds = new Set(state.expandedNodeIds);
  const collapsedNodeIds = new Set(state.collapsedNodeIds);

  if (isExpanded) {
    expandedNodeIds.delete(nodeId);
    collapsedNodeIds.add(nodeId);
  } else {
    collapsedNodeIds.delete(nodeId);
    expandedNodeIds.add(nodeId);
  }

  return { collapsedNodeIds, expandedNodeIds };
}

export function mindMapBranchControls({
  canExpand,
  expanded,
  explicitlyExpanded,
}: {
  canExpand: boolean;
  expanded: boolean;
  explicitlyExpanded: boolean;
}) {
  return {
    collapseAriaExpanded: expanded ? (true as const) : undefined,
    showCollapse: expanded,
    showExpand: canExpand && !explicitlyExpanded,
    showHiddenStatus: canExpand && explicitlyExpanded,
  };
}
