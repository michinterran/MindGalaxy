import { z } from "zod";
import { EDGE_KINDS } from "@/lib/graph/schema";

export const GRAPH_MUTATION_LIMITS = {
  maxCoordinate: 1_000_000,
  maxEdgeLabelLength: 160,
  maxNodeSummaryLength: 4_000,
  maxNodeTitleLength: 240,
} as const;

export const graphPositionSchema = z
  .object({
    x: z
      .number()
      .finite()
      .min(-GRAPH_MUTATION_LIMITS.maxCoordinate)
      .max(GRAPH_MUTATION_LIMITS.maxCoordinate),
    y: z
      .number()
      .finite()
      .min(-GRAPH_MUTATION_LIMITS.maxCoordinate)
      .max(GRAPH_MUTATION_LIMITS.maxCoordinate),
  })
  .strict();

export const graphIdSchema = z.uuid();

export const updateGraphNodeInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(GRAPH_MUTATION_LIMITS.maxNodeTitleLength)
      .optional(),
    summary: z
      .string()
      .trim()
      .max(GRAPH_MUTATION_LIMITS.maxNodeSummaryLength)
      .nullable()
      .optional(),
    position: graphPositionSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.summary !== undefined ||
      input.position !== undefined,
    { message: "At least one node field is required" },
  );

export const createGraphEdgeInputSchema = z
  .object({
    workspaceId: z.uuid(),
    sourceNodeId: z.uuid(),
    targetNodeId: z.uuid(),
    kind: z.enum(EDGE_KINDS),
    label: z
      .string()
      .trim()
      .max(GRAPH_MUTATION_LIMITS.maxEdgeLabelLength)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((input) => input.sourceNodeId !== input.targetNodeId, {
    message: "An edge must connect two different nodes",
    path: ["targetNodeId"],
  });

export type GraphPosition = z.infer<typeof graphPositionSchema>;
export type UpdateGraphNodeInput = z.input<typeof updateGraphNodeInputSchema>;
export type UpdateGraphNodeCommand = z.output<typeof updateGraphNodeInputSchema>;
export type CreateGraphEdgeInput = z.input<typeof createGraphEdgeInputSchema>;
export type CreateGraphEdgeCommand = z.output<typeof createGraphEdgeInputSchema>;
