import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireLibraryClients: vi.fn(),
}));

vi.mock("@/features/library/server/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/library/server/http")>()),
  requireLibraryClients: mocks.requireLibraryClients,
}));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const folderId = "22222222-2222-4222-8222-222222222222";
const captureId = "33333333-3333-4333-8333-333333333333";

function jsonRequest(url: string, method: string) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify({}),
  });
}

const organizerRoutes = [
  {
    name: "GET /api/library-organizer",
    invoke: async () => {
      const { GET } = await import("@/app/api/library-organizer/route");
      return GET(
        new NextRequest(
          `http://localhost/api/library-organizer?workspaceId=${workspaceId}&from=2026-07-01T00%3A00%3A00.000Z&toExclusive=2026-08-01T00%3A00%3A00.000Z`,
        ),
      );
    },
  },
  {
    name: "POST /api/library-organizer/folders",
    invoke: async () => {
      const { POST } = await import("@/app/api/library-organizer/folders/route");
      return POST(jsonRequest("http://localhost/api/library-organizer/folders", "POST"));
    },
  },
  {
    name: "PATCH /api/library-organizer/folders/[folderId]",
    invoke: async () => {
      const { PATCH } = await import("@/app/api/library-organizer/folders/[folderId]/route");
      return PATCH(
        jsonRequest(`http://localhost/api/library-organizer/folders/${folderId}`, "PATCH"),
        { params: Promise.resolve({ folderId }) },
      );
    },
  },
  {
    name: "DELETE /api/library-organizer/folders/[folderId]",
    invoke: async () => {
      const { DELETE } = await import("@/app/api/library-organizer/folders/[folderId]/route");
      return DELETE(
        jsonRequest(`http://localhost/api/library-organizer/folders/${folderId}`, "DELETE"),
        { params: Promise.resolve({ folderId }) },
      );
    },
  },
  {
    name: "POST /api/library-organizer/topics",
    invoke: async () => {
      const { POST } = await import("@/app/api/library-organizer/topics/route");
      return POST(jsonRequest("http://localhost/api/library-organizer/topics", "POST"));
    },
  },
  {
    name: "PATCH /api/library-organizer/captures/[captureId]",
    invoke: async () => {
      const { PATCH } = await import("@/app/api/library-organizer/captures/[captureId]/route");
      return PATCH(
        jsonRequest(`http://localhost/api/library-organizer/captures/${captureId}`, "PATCH"),
        { params: Promise.resolve({ captureId }) },
      );
    },
  },
] as const;

describe("library organizer route error boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(organizerRoutes)("preserves AUTH_REQUIRED for $name", async ({ invoke }) => {
    const { LibraryError } = await import("@/features/library/server/dal");
    mocks.requireLibraryClients.mockRejectedValue(
      new LibraryError("AUTH_REQUIRED", 401),
    );

    const response = await invoke();

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
  });

  it.each([
    ["AUTH_REQUIRED", 401],
    ["LIBRARY_WRITE_FORBIDDEN", 403],
    ["CAPTURE_NOT_FOUND", 404],
    ["SUPABASE_NOT_CONFIGURED", 503],
  ] as const)("preserves LibraryError %s as HTTP %i", async (code, status) => {
    const [{ LibraryError }, { organizerErrorResponse }] = await Promise.all([
      import("@/features/library/server/dal"),
      import("@/features/library-organizer/server/http"),
    ]);

    const response = organizerErrorResponse(new LibraryError(code, status));

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: code });
  });
});
