import { z } from "zod";
import { ANALYSIS_QUEUE_REGISTRY } from "@/config/registry";

export const captureAnalysisEventSchema = z.object({
  schemaVersion: z.literal(ANALYSIS_QUEUE_REGISTRY.schemaVersion),
  eventType: z.literal(ANALYSIS_QUEUE_REGISTRY.eventType),
  processingJobId: z.string().uuid(),
  captureId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdAt: z.iso.datetime(),
});

export type CaptureAnalysisEvent = z.infer<typeof captureAnalysisEventSchema>;
