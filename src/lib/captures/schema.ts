import { z } from "zod";
import {
  CAPTURE_LIMITS,
  CAPTURE_SOURCE_KIND_VALUES,
  LIST_QUERY_LIMITS,
} from "@/config/domain";

export const createCaptureInputSchema = z.object({
  workspaceId: z.uuid(),
  requestId: z.uuid().default(() => crypto.randomUUID()),
  projectId: z.uuid().optional().nullable(),
  title: z.string().trim().min(1).max(CAPTURE_LIMITS.maxTitleLength).optional(),
  rawText: z.string().trim().min(1).max(CAPTURE_LIMITS.maxRawTextLength),
  sourceKind: z.enum(CAPTURE_SOURCE_KIND_VALUES).default("paste"),
  source: z
    .object({
      label: z
        .string()
        .trim()
        .min(1)
        .max(CAPTURE_LIMITS.maxSourceLabelLength)
        .default("붙여넣기"),
      url: z.url().optional().nullable(),
      provider: z
        .string()
        .trim()
        .max(CAPTURE_LIMITS.maxSourceProviderLength)
        .optional()
        .nullable(),
      author: z
        .string()
        .trim()
        .max(CAPTURE_LIMITS.maxSourceAuthorLength)
        .optional()
        .nullable(),
      capturedAt: z.iso.datetime().optional().nullable(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateCaptureInput = z.input<typeof createCaptureInputSchema>;
export type CreateCaptureCommand = z.output<typeof createCaptureInputSchema>;

export const captureListQuerySchema = z.object({
  workspaceId: z.uuid(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_QUERY_LIMITS.maxLimit)
    .default(LIST_QUERY_LIMITS.defaultLimit),
});
