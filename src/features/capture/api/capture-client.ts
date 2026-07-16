import type { CreateCaptureInput } from "@/lib/captures/schema";
import { t, type Locale } from "@/lib/i18n";

export type CreateCaptureResponse = {
  capture: {
    id: string;
    workspace_id: string;
    project_id: string | null;
    title: string | null;
    source_kind: string;
    created_at: string;
  };
  processingJob: {
    id: string;
    status: string;
    job_type: string;
    created_at: string;
  };
  analysisDispatch: "outbox";
};

export class CaptureClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

export function captureErrorMessage(locale: Locale, code: string) {
  if (code === "AUTH_REQUIRED") {
    return t(locale, "capture.status.error.authRequired");
  }

  if (code === "SUPABASE_NOT_CONFIGURED") {
    return t(locale, "capture.status.error.notConfigured");
  }

  if (code === "INVALID_JSON") {
    return t(locale, "capture.status.error.invalidJson");
  }

  if (code === "VALIDATION_ERROR") {
    return t(locale, "capture.status.error.validation");
  }

  return t(locale, "capture.status.error.default");
}

export async function createCapture(
  input: CreateCaptureInput,
): Promise<CreateCaptureResponse> {
  const requestId = input.requestId ?? crypto.randomUUID();

  const response = await fetch("/api/captures", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...input, requestId }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new CaptureClientError(
      body?.error ?? "CAPTURE_CREATE_FAILED",
      response.status,
    );
  }

  return response.json() as Promise<CreateCaptureResponse>;
}
