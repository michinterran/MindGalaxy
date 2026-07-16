type AnalysisLogLevel = "info" | "warn" | "error";

export type AnalysisLogEvent = {
  event: string;
  stage: string;
  jobId?: string;
  captureId?: string;
  workspaceId?: string;
  queueMessageId?: string | null;
  deliveryCount?: number;
  attemptNumber?: number;
  durationMs?: number;
  errorCode?: string;
  outcome?: string;
  model?: string;
  promptVersion?: string;
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  embeddingTokens?: number;
};

export function analysisErrorCode(error: unknown) {
  if (error && typeof error === "object") {
    const status = "status" in error ? Number(error.status) : 0;
    const code = "code" in error ? String(error.code) : "";

    if (status === 429) return "ANALYSIS_PROVIDER_RATE_LIMITED";
    if (status >= 500) return "ANALYSIS_PROVIDER_UNAVAILABLE";
    if (/^[A-Z][A-Z0-9_]{2,80}$/.test(code)) return code;
  }

  if (error instanceof Error) {
    if (
      error.message.includes("Zod field at") &&
      error.message.includes("not supported by the API")
    ) {
      return "ANALYSIS_OUTPUT_SCHEMA_INVALID";
    }

    if (/^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)) {
      return error.message;
    }

    if (error.name === "APIConnectionError") {
      return "ANALYSIS_PROVIDER_UNAVAILABLE";
    }
  }

  return "ANALYSIS_UNEXPECTED_ERROR";
}

export function logAnalysisEvent(
  level: AnalysisLogLevel,
  entry: AnalysisLogEvent,
) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "capture-analysis",
    ...entry,
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}
