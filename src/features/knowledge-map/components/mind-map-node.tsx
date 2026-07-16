"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  isMindMapActivationKey,
  mindMapBranchControls,
} from "@/features/knowledge-map/components/mind-map-interactions";
import type { MindMapProjectedNode } from "@/features/knowledge-map/model/graph";

export type MindMapNodeData = MindMapProjectedNode & {
  collapseLabel: string;
  expandLabel: string;
  focusLabel: string;
  highlighted?: boolean;
  onFocus: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onToggleBranch: (nodeId: string, isExpanded: boolean) => void;
  selectLabel: string;
  selected?: boolean;
};

function getToneClass(tone: MindMapProjectedNode["tone"]) {
  return `mind-node--${tone}`;
}

export function MindMapNode({
  data,
}: NodeProps<MindMapNodeData>) {
  const importanceClass =
    data.importance > 0.74
      ? "mind-node--major"
      : data.importance > 0.42
        ? "mind-node--mid"
        : "mind-node--minor";
  const branchControls = mindMapBranchControls(data);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isMindMapActivationKey(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    data.onSelect(data.id);
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
