import { PROCESSING_STATUS } from "@/config/domain";

export const MODEL_REGISTRY = {
  captureStructuring: {
    provider: "openai",
    model: "gpt-5-mini",
  },
  embedding: {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
} as const;

export const PROMPT_REGISTRY = {
  captureStructuring: {
    version: "mindgalaxy-capture-v1",
    purpose: "Extract nodes, edges, contexts, and evidence snippets from a raw capture.",
  },
} as const;

export const JOB_REGISTRY = {
  captureStructuring: {
    type: "capture_structure",
    initialStatus: PROCESSING_STATUS.queued,
    prompt: PROMPT_REGISTRY.captureStructuring,
    model: MODEL_REGISTRY.captureStructuring,
    leaseSeconds: 120,
    maxAttempts: 3,
    maxBatchSize: 5,
    retryBaseDelaySeconds: 60,
    limits: {
      maxNodes: 24,
      maxEdges: 48,
      maxContexts: 32,
    },
    confidence: {
      autoCompleteThreshold: 0.72,
      needsReviewThreshold: 0.55,
    },
  },
} as const;

export const SEARCH_REGISTRY = {
  defaultLimit: 10,
  maxLimit: 20,
  queryMaxChars: 500,
  snippetMaxChars: 500,
  embeddingInputMaxChars: 6000,
  embeddingBatchMaxInputs: 25,
  embedding: MODEL_REGISTRY.embedding,
  weights: {
    lexical: 0.45,
    semantic: 0.45,
    graph: 0.1,
  },
  semanticCandidateThreshold: 0.2,
  answer: {
    model: MODEL_REGISTRY.captureStructuring.model,
    maxContextResults: 5,
    maxCitations: 5,
    maxQuoteChars: 500,
    maxAnswerChars: 1200,
    lowConfidence: 0.25,
  },
} as const;

export const SEARCH_SQL_PARITY_MARKER = {
  maxLimit: SEARCH_REGISTRY.maxLimit,
  queryMaxChars: SEARCH_REGISTRY.queryMaxChars,
  snippetMaxChars: SEARCH_REGISTRY.snippetMaxChars,
  embeddingDimensions: SEARCH_REGISTRY.embedding.dimensions,
  semanticCandidateThreshold: SEARCH_REGISTRY.semanticCandidateThreshold,
  weights: SEARCH_REGISTRY.weights,
} as const;

export const FEATURE_REGISTRY = {
  demoGraphFallback: true,
  galaxyRenderer: true,
  captureStructuringJobs: true,
} as const;
