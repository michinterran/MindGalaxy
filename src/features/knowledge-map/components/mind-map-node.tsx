"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import type { PositionedGraphNode } from "@/features/knowledge-map/model/graph";

function getToneClass(tone: PositionedGraphNode["tone"]) {
  return `mind-node--${tone}`;
}

export function MindMapNode({
  data,
}: NodeProps<PositionedGraphNode & { highlighted?: boolean; selected?: boolean }>) {
  const importanceClass =
    data.importance > 0.74
      ? "mind-node--major"
      : data.importance > 0.42
        ? "mind-node--mid"
        : "mind-node--minor";

  return (
    <article
      className={`mind-node ${getToneClass(data.tone)} ${
        data.selected ? "mind-node--selected" : ""
      } ${data.highlighted ? "mind-node--highlighted" : ""} ${importanceClass}`}
    >
      <Handle className="mind-node__handle" position={Position.Left} type="target" />
      <div className="mind-node__stripe" />
      <div className="mind-node__body">
        <div className="mind-node__topline">
          <span>{data.eyebrow}</span>
          <span>{data.confidenceLabel ?? `${data.degree}`}</span>
        </div>
        <h3>{data.title}</h3>
        <p>{data.summary}</p>
      </div>
      <Handle className="mind-node__handle" position={Position.Right} type="source" />
    </article>
  );
}
