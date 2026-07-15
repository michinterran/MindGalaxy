import { LibraryClientError } from "@/features/library/api/library-client";

const RECONNECT_ERROR_KEYS = {
  PROCESSING_JOB_NOT_STALE: "workspace.analysisReconnect.error.notStale",
  PROCESSING_JOB_RECONNECT_NOT_ALLOWED:
    "workspace.analysisReconnect.error.notAllowed",
  LIBRARY_WRITE_FORBIDDEN: "workspace.analysisReconnect.error.forbidden",
} as const;

export type ReconnectErrorMessageKey =
  | (typeof RECONNECT_ERROR_KEYS)[keyof typeof RECONNECT_ERROR_KEYS]
  | "workspace.analysisReconnect.error.default";

export function reconnectErrorMessageKey(
  error: unknown,
): ReconnectErrorMessageKey {
  if (error instanceof LibraryClientError) {
    return (
      RECONNECT_ERROR_KEYS[
        error.code as keyof typeof RECONNECT_ERROR_KEYS
      ] ?? "workspace.analysisReconnect.error.default"
    );
  }
  return "workspace.analysisReconnect.error.default";
}
