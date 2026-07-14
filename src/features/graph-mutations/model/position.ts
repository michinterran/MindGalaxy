import type { GraphPosition } from "@/features/graph-mutations/model/schemas";
import type { Json } from "@/types/database";

function jsonObject(value: Json | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

export function readNodePosition(metadata: Json): GraphPosition | undefined {
  const ui = jsonObject(jsonObject(metadata).ui);
  const position = jsonObject(ui.position);

  return typeof position.x === "number" &&
    Number.isFinite(position.x) &&
    typeof position.y === "number" &&
    Number.isFinite(position.y)
    ? { x: position.x, y: position.y }
    : undefined;
}

export function mergeNodePosition(
  metadata: Json,
  position: GraphPosition,
): Json {
  const root = jsonObject(metadata);
  const ui = jsonObject(root.ui);

  return {
    ...root,
    ui: {
      ...ui,
      position: {
        x: position.x,
        y: position.y,
      },
    },
  };
}
