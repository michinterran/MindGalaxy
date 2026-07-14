import { z } from "zod";
import { JOB_REGISTRY } from "@/config/registry";
import {
  CONTEXT_KINDS,
  EDGE_KINDS,
  NODE_KINDS,
} from "@/lib/graph/schema";

const evidenceSchema = z.object({
  quote: z.string().trim().min(1).max(500),
});

export const analysisContextSchema = z.object({
  clientContextId: z.string().trim().min(1).max(80),
  kind: z.enum(CONTEXT_KINDS),
  label: z.string().trim().min(1).max(160),
  normalizedValue: z.string().trim().max(240).optional(),
  evidence: evidenceSchema.optional(),
  confidence: z.number().min(0).max(1).default(0.7),
});

export const analysisNodeSchema = z.object({
  clientNodeId: z.string().trim().min(1).max(80),
  kind: z.enum(NODE_KINDS),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(800).optional(),
  evidence: evidenceSchema.optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  contextClientIds: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
});

export const analysisEdgeSchema = z.object({
  sourceClientNodeId: z.string().trim().min(1).max(80),
  targetClientNodeId: z.string().trim().min(1).max(80),
  kind: z.enum(EDGE_KINDS),
  label: z.string().trim().max(160).optional(),
  evidence: evidenceSchema.optional(),
  confidence: z.number().min(0).max(1).default(0.7),
});

export const captureAnalysisSchema = z.object({
  captureSummary: z.string().trim().max(600).optional(),
  language: z.enum(["ko", "en", "mixed", "unknown"]).default("unknown"),
  nodes: z
    .array(analysisNodeSchema)
    .min(1)
    .max(JOB_REGISTRY.captureStructuring.limits.maxNodes),
  edges: z.array(analysisEdgeSchema).max(JOB_REGISTRY.captureStructuring.limits.maxEdges),
  contexts: z
    .array(analysisContextSchema)
    .max(JOB_REGISTRY.captureStructuring.limits.maxContexts),
});

export type CaptureAnalysisOutput = z.infer<typeof captureAnalysisSchema>;
export type AnalysisEvidence = z.infer<typeof evidenceSchema>;
