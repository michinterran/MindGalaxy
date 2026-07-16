"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Handle, Position, type NodeProps, useReactFlow } from "reactflow";
import {
  isMindMapActivationKey,
  mindMapKeyboardNudge,
  mindMapBranchControls,
} from "@/features/knowledge-map/components/mind-map-interactions";
import type { MindMapProjectedNode } from "@/features/knowledge-map/model/graph";

export type MindMapNodeData = MindMapProjectedNode & {
  canMove: boolean;
  collapseLabel: string;
  expandLabel: string;
  focusLabel: string;
  highlighted?: boolean;
  onFocus: (nodeId: string) => void;
  onPositionChange: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
  onSelect: (nodeId: string) => void;
  onToggleBranch: (nodeId: string, isExpanded: boolean) => void;
  positionHint: string;
  selectLabel: string;
  selected?: boolean;
};

function getToneClass(tone: MindMapProjectedNode["tone"]) {
  return `mind-node--${tone}`;
}

export function MindMapNode({
  data,
}: NodeProps<MindMapNodeData>) {
  const { getNode, setNodes } = useReactFlow<MindMapNodeData>();
  const importanceClass =
    data.importance > 0.74
      ? "mind-node--major"
      : data.importance > 0.42
        ? "mind-node--mid"
        : "mind-node--minor";
  const branchControls = mindMapBranchControls(data);
  const positionHintId = `mind-node-${data.id}-position-hint`;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (isMindMapActivationKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      data.onSelect(data.id);
      return;
    }

    if (!data.canMove) return;
    const delta = mindMapKeyboardNudge(event.key, event.altKey);
    if (!delta) return;
    const node = getNode(data.id);
    if (!node) return;

    event.preventDefault();
    event.stopPropagation();
    const position = {
      x: node.position.x + delta.x,
      y: node.position.y + delta.y,
    };
    setNodes((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === data.id ? { ...currentNode, position } : currentNode,
      ),
    );
    data.onPositionChange(data.id, position);
  }

  function handleBranchClick(
    event: MouseEvent<HTMLButtonElement>,
    currentExpansionState: boolean,
  ) {
    event.preventDefault();
    event.stopPropagation();
    data.onToggleBranch(data.id, currentExpansionState);
  }

  function handleFocusClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    data.onFocus(data.id);
  }

  return (
    <>
      <article
        aria-describedby={data.canMove ? positionHintId : undefined}
        aria-label={data.selectLabel}
        aria-pressed={data.selected}
        className={`mind-node ${getToneClass(data.tone)} ${
          data.selected ? "mind-node--selected" : ""
        } ${data.highlighted ? "mind-node--highlighted" : ""} ${importanceClass}`}
        onClick={() => data.onSelect(data.id)}
        onDoubleClick={() => data.onFocus(data.id)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        title={data.focusLabel}
      >
        {data.canMove ? (
          <span className="sr-only" id={positionHintId}>
            {data.positionHint}
          </span>
        ) : null}
        <Handle className="mind-node__handle" position={Position.Left} type="target" />
        <div className="mind-node__stripe" />
        <div className="mind-node__body">
          <div className="mind-node__topline">
            <span>{data.eyebrow}</span>
          </div>
          <h3>{data.title}</h3>
          <p>{data.summary}</p>
        </div>
        <Handle className="mind-node__handle" position={Position.Right} type="source" />
      </article>
      <button
        aria-label={data.focusLabel}
        className="mind-node__focus-control nodrag nopan"
        onClick={handleFocusClick}
        type="button"
      >
        <span aria-hidden="true">◎</span>
      </button>
      {data.hasChildren && (data.expanded || data.canExpand) ? (
        <div className="mind-node__branch-controls nodrag nopan">
          {branchControls.showCollapse ? (
            <button
              aria-expanded={branchControls.collapseAriaExpanded}
              aria-label={data.collapseLabel}
              onClick={(event) => handleBranchClick(event, true)}
              type="button"
            >
              <span aria-hidden="true">−</span>
            </button>
          ) : null}
          {branchControls.showExpand ? (
            <button
              aria-label={data.expandLabel}
              onClick={(event) => handleBranchClick(event, false)}
              type="button"
            >
              <span aria-hidden="true">+{data.hiddenChildCount}</span>
            </button>
          ) : branchControls.showHiddenStatus ? (
            <span
              aria-label={data.expandLabel}
              className="mind-node__hidden-count"
              role="status"
            >
              +{data.hiddenChildCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
