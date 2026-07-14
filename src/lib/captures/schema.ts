import { z } from "zod";

export const createCaptureInputSchema = z.object({
  workspaceId: z.uuid(),
  projectId: z.uuid().optional().nullable(),
  title: z.string().trim().min(1).max(160).optional(),
  rawText: z.string().trim().min(1).max(60_000),
  sourceKind: z
    .enum(["paste", "chatgpt", "claude", "gemini", "web", "file", "manual"])
    .default("paste"),
  source: z
    .object({
      label: z.string().trim().min(1).max(160).default("붙여넣기"),
      url: z.url().optional().nullable(),
      provider: z.string().trim().max(80).optional().nullable(),
      author: z.string().trim().max(120).optional().nullable(),
      capturedAt: z.iso.datetime().optional().nullable(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateCaptureInput = z.infer<typeof createCaptureInputSchema>;

export const captureListQuerySchema = z.object({
  workspaceId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
