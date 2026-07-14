import { describe, expect, it } from "vitest";
import {
  createGraphEdgeInputSchema,
  updateGraphNodeInputSchema,
} from "@/features/graph-mutations/model/schemas";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const sourceNodeId = "22222222-2222-4222-8222-222222222222";
const targetNodeId = "33333333-3333-4333-8333-333333333333";

describe("graph mutation schemas", () => {
  it("accepts a partial node update with a finite saved position", () => {
    expect(
      updateGraphNodeInputSchema.parse({
        title: "  Updated title  ",
        summary: null,
        position: { x: 120.5, y: -48 },
      }),
    ).toEqual({
      title: "Updated title",
      summary: null,
      position: { x: 120.5, y: -48 },
    });
  });

  it("rejects empty node updates and non-finite positions", () => {
    expect(updateGraphNodeInputSchema.safeParse({}).success).toBe(false);
    expect(
      updateGraphNodeInputSchema.safeParse({ position: { x: Infinity, y: 0 } })
        .success,
    ).toBe(false);
  });

  it("accepts only registered edge kinds between different nodes", () => {
    expect(
      createGraphEdgeInputSchema.parse({
        workspaceId,
        sourceNodeId,
        targetNodeId,
        kind: "supports",
        label: "  evidence  ",
      }),
    ).toMatchObject({ kind: "supports", label: "evidence" });

    expect(
      createGraphEdgeInputSchema.safeParse({
        workspaceId,
        sourceNodeId,
        targetNodeId,
        kind: "invented_kind",
      }).success,
    ).toBe(false);

    expect(
      createGraphEdgeInputSchema.safeParse({
        workspaceId,
        sourceNodeId,
        targetNodeId: sourceNodeId,
        kind: "relates_to",
      }).success,
    ).toBe(false);
  });
});
