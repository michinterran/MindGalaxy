import type { UpdateCaptureTitleInput } from "@/features/library/model/schemas";
import type { ProcessingStatus } from "@/types/domain";

export type CaptureDetail = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string | null;
  rawText: string;
  sourceKind: string;
  createdAt: string;
  updatedAt: string;
  source: {
    label: string;
    url: string | null;
    provider: string | null;
    author: string | null;
    capturedAt: string | null;
  } | null;
  processingJobId: string | null;
  processingStatus: ProcessingStatus | null;
  processingError: string | null;
  processingUpdatedAt: string | null;
  retryCount: number;
  maxAttempts: number;
  derivedNodeCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

export type CaptureDetailResponse = { capture: CaptureDetail };
export type RetryProcessingJobResponse = {
  processingJob: {
    id: string;
    status: ProcessingStatus;
    retryCount: number;
    maxAttempts: number;
    nextRunAt: string;
  };
};

export class LibraryClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "LibraryClientError";
  }
}

async function libraryRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers:
      init?.body === undefined
        ? init?.headers
        : { "Content-Type": "application/json", ...init.headers },
  });

  const body = (await response.json().catch(() => null)) as
    | ({ error?: string; details?: unknown } & Record<string, unknown>)
    | null;

  if (!response.ok) {
    throw new LibraryClientError(
      body?.error ?? "LIBRARY_REQUEST_FAILED",
      response.status,
      body?.details,
    );
  }

  return body as T;
}

export async function getCaptureDetail(captureId: string): Promise<CaptureDetail> {
  const result = await libraryRequest<CaptureDetailResponse>(
    `/api/captures/${encodeURIComponent(captureId)}`,
  );
  return result.capture;
}

export async function updateCaptureTitle(
  captureId: string,
  input: UpdateCaptureTitleInput,
): Promise<CaptureDetail> {
  const result = await libraryRequest<CaptureDetailResponse>(
    `/api/captures/${encodeURIComponent(captureId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.capture;
}

export function deleteCapture(
  captureId: string,
): Promise<{ deletedCaptureId: string }> {
  return libraryRequest(`/api/captures/${encodeURIComponent(captureId)}`, {
    method: "DELETE",
  });
}

export function retryProcessingJob(
  jobId: string,
): Promise<RetryProcessingJobResponse> {
  return libraryRequest(
    `/api/processing-jobs/${encodeURIComponent(jobId)}/retry`,
    { method: "POST" },
  );
}

export type { UpdateCaptureTitleInput };
