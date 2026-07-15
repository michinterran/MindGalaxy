import { PROCESSING_STATUS } from "@/config/domain";
import type { EdgeKind } from "@/types/domain";

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
    // Keep the database lease longer than the 300 second function budget so
    // another delivery cannot reclaim an actively-running OpenAI request.
    leaseSeconds: 330,
    maxAttempts: 3,
    maxManualAttempts: 10,
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

export const ANALYSIS_QUEUE_REGISTRY = {
  topic: "capture-analysis",
  eventType: "capture.created",
  schemaVersion: 1,
  retentionSeconds: 86_400,
  visibilityTimeoutSeconds: 360,
  // Transport delivery failures (OIDC, network, service initialization) can
  // happen before a database attempt is recorded. Keep this budget larger
  // than the analysis attempt budget so transient infrastructure failures do
  // not strand an otherwise untouched processing job.
  poisonDeliveryThreshold: 10,
  // A queued job that has not changed for two full visibility windows can be
  // safely re-published. Exact job claiming still prevents duplicate work.
  reconnectAfterSeconds: 720,
} as const;

export const JOB_SQL_PARITY_MARKER = {
  maxManualAttempts: JOB_REGISTRY.captureStructuring.maxManualAttempts,
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
  demoGraphFallback: false,
  galaxyRenderer: true,
  captureStructuringJobs: true,
} as const;

export const WORKSPACE_REGISTRY = {
  activeJobPollIntervalMs: 4_000,
  attentionStatuses: [
    PROCESSING_STATUS.queued,
    PROCESSING_STATUS.running,
    PROCESSING_STATUS.needsReview,
    PROCESSING_STATUS.failed,
  ],
  activeStatuses: [PROCESSING_STATUS.queued, PROCESSING_STATUS.running],
  searchResultLimit: SEARCH_REGISTRY.defaultLimit,
} as const;

export const GRAPH_INTERACTION_REGISTRY = {
  defaultEdgeKind: "relates_to" satisfies EdgeKind,
  deleteUndoDelayMs: 5_000,
  nodePositionSaveDebounceMs: 450,
} as const;
