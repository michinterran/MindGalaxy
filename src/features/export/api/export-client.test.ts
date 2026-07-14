import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExportClientError,
  isAbortErrorLike,
  requestWorkspaceExport,
  testables,
} from "@/features/export/api/export-client";

describe("requestWorkspaceExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts bounded export input and reads RFC5987 filenames", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["ok"]), {
        headers: {
          "content-disposition":
            "attachment; filename=\"fallback.html\"; filename*=UTF-8''%ED%95%9C%EA%B8%80.html",
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestWorkspaceExport({
      kind: "html",
      locale: "ko",
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });

    expect(result.filename).toBe("한글.html");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exports",
      expect.objectContaining({
        body: JSON.stringify({
          kind: "html",
          locale: "ko",
          workspaceId: "00000000-0000-0000-0000-000000000000",
        }),
        method: "POST",
      }),
    );
  });

  it("throws public export errors without relying on raw server details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: "EXPORT_EMPTY_GRAPH" }, { status: 422 }),
      ),
    );

    await expect(
      requestWorkspaceExport({
        kind: "pdf",
        locale: "en",
        workspaceId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject(new ExportClientError("EXPORT_EMPTY_GRAPH", 422));
  });
});
describe("export client helpers", () => {
  it("recognizes abort-shaped errors", () => {
    const error = new Error("aborted");
    error.name = "AbortError";

    expect(isAbortErrorLike(error)).toBe(true);
    expect(isAbortErrorLike({ name: "AbortError" })).toBe(true);
    expect(isAbortErrorLike({ name: "Other" })).toBe(false);
  });

  it("falls back when content disposition is malformed", () => {
    expect(
      testables.filenameFromContentDisposition(
        "attachment; filename*=UTF-8''%E0%A4%A",
        "fallback.pdf",
      ),
    ).toBe("fallback.pdf");
  });
});
