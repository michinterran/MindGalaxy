import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LibraryClientError,
  deleteCapture,
  getCaptureDetail,
  reconnectProcessingJob,
  retryProcessingJob,
  updateCaptureTitle,
} from "@/features/library/api/library-client";

const captureId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";

afterEach(() => vi.unstubAllGlobals());

describe("library client", () => {
  it("uses resource-scoped routes and unwraps capture detail", async () => {
    const capture = { id: captureId, title: "Saved" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ capture }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCaptureDetail(captureId)).resolves.toEqual(capture);
    expect(fetchMock).toHaveBeenCalledWith(`/api/captures/${captureId}`, {
      headers: undefined,
    });
  });

  it("sends title-only PATCH JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ capture: { id: captureId, title: "New" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateCaptureTitle(captureId, { title: "New" });
    expect(fetchMock).toHaveBeenCalledWith(`/api/captures/${captureId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "New" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("uses explicit delete, retry, and reconnect endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deletedCaptureId: captureId }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ processingJob: { id: jobId, status: "queued" } }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            processingJob: { id: jobId, status: "queued" },
            analysisDispatch: "queue",
          }),
          { status: 202 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await deleteCapture(captureId);
    await retryProcessingJob(jobId);
    await reconnectProcessingJob(jobId);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/captures/${captureId}`, {
      method: "DELETE",
      headers: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/processing-jobs/${jobId}/retry`,
      { method: "POST", headers: undefined },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/processing-jobs/${jobId}/reconnect`,
      { method: "POST", headers: undefined },
    );
  });

  it("preserves API error codes for the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "LIBRARY_WRITE_FORBIDDEN" }), {
          status: 403,
        }),
      ),
    );

    await expect(deleteCapture(captureId)).rejects.toEqual(
      expect.objectContaining<Partial<LibraryClientError>>({
        code: "LIBRARY_WRITE_FORBIDDEN",
        status: 403,
      }),
    );
  });
});
