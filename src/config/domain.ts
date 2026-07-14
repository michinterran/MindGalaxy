export const CAPTURE_SOURCE_KIND_VALUES = [
  "paste",
  "chatgpt",
  "claude",
  "gemini",
  "web",
  "file",
  "manual",
] as const;

export const PROCESSING_STATUS_VALUES = [
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
] as const;

export const PROCESSING_STATUS = {
  queued: "queued",
  running: "running",
  needsReview: "needs_review",
  completed: "completed",
  failed: "failed",
} as const;

export const CAPTURE_LIMITS = {
  maxRawTextLength: 60_000,
  maxTitleLength: 160,
  maxSourceLabelLength: 160,
  maxSourceProviderLength: 80,
  maxSourceAuthorLength: 120,
} as const;

export const LIST_QUERY_LIMITS = {
  defaultLimit: 20,
  maxLimit: 50,
} as const;
