import { z } from "zod";
import { SEARCH_REGISTRY } from "@/config/registry";
import { NODE_KINDS } from "@/lib/graph/schema";

export const searchRequestSchema = z.object({
  workspaceId: z.uuid(),
  locale: z.enum(["ko", "en"]).default("ko"),
  query: z
    .string()
    .trim()
    .min(2)
    .max(SEARCH_REGISTRY.queryMaxChars),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_REGISTRY.maxLimit)
    .default(SEARCH_REGISTRY.defaultLimit),
});

export const searchResultSchema = z.object({
  resultId: z.string().min(1),
  sourceType: z.enum(["node", "capture"]),
  title: z.string(),
  snippet: z.string().max(SEARCH_REGISTRY.snippetMaxChars),
  evidence: z.string().nullable(),
  nodeKind: z.enum(NODE_KINDS).nullable(),
  captureId: z.uuid().nullable(),
  lexicalScore: z.number().min(0).max(1),
  semanticScore: z.number().min(0).max(1),
  graphScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
});

export const groundedCitationSchema = z.object({
  resultId: z.string().min(1),
  quote: z.string().trim().min(1).max(SEARCH_REGISTRY.answer.maxQuoteChars),
});

export const groundedAnswerSchema = z.object({
  answer: z.string().trim().max(SEARCH_REGISTRY.answer.maxAnswerChars),
  grounded: z.boolean(),
  confidence: z.number().min(0).max(1),
  citations: z
    .array(groundedCitationSchema)
    .max(SEARCH_REGISTRY.answer.maxCitations),
});

export const searchResponseSchema = z.object({
  query: z.string(),
  workspaceId: z.uuid(),
  results: z.array(searchResultSchema),
  answer: groundedAnswerSchema,
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
