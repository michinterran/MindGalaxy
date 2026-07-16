import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

function query(data: unknown, error: { code?: string } | null = null) {
  const result = { data, error };
  const builder = {
    delete: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    is: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    lt: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
    upsert: vi.fn().mockResolvedValue(result),
  };

  for (const method of [
    "delete",
    "eq",
    "gte",
    "in",
    "insert",
    "is",
    "lt",
    "order",
    "select",
    "update",
  ] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const captureId = "22222222-2222-4222-8222-222222222222";
const folderId = "33333333-3333-4333-8333-333333333333";
const topicContextId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";

describe("library organization DAL", () => {
  let createFolderRecord: typeof import("@/features/library/server/organization")["createFolderRecord"];
  let moveCaptureToFolderRecord: typeof import("@/features/library/server/organization")["moveCaptureToFolderRecord"];
  let assignCaptureTopicRecord: typeof import("@/features/library/server/organization")["assignCaptureTopicRecord"];
  let createTopicRecord: typeof import("@/features/library/server/organization")["createTopicRecord"];
  let deleteFolderRecord: typeof import("@/features/library/server/organization")["deleteFolderRecord"];
  let listCaptureTopicAssignments: typeof import("@/features/library/server/organization")["listCaptureTopicAssignments"];
  let renameFolderRecord: typeof import("@/features/library/server/organization")["renameFolderRecord"];
  let listCalendarCaptureRecords: typeof import("@/features/library/server/organization")["listCalendarCaptureRecords"];
  let updateCaptureOrganizationRecord: typeof import("@/features/library/server/organization")["updateCaptureOrganizationRecord"];

  beforeAll(async () => {
    ({
      createFolderRecord,
      moveCaptureToFolderRecord,
      assignCaptureTopicRecord,
      createTopicRecord,
      deleteFolderRecord,
      listCaptureTopicAssignments,
      renameFolderRecord,
      listCalendarCaptureRecords,
      updateCaptureOrganizationRecord,
    } = await import("@/features/library/server/organization"));
  });

  it("updates folder and topics through one atomic RPC boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(updateCaptureOrganizationRecord(
      {
        actor: {} as SupabaseClient<Database>,
        service: { rpc } as unknown as SupabaseClient<Database>,
        userId,
      },
      { captureId, folderId, topicIds: [topicContextId] },
    )).resolves.toEqual({ captureId, folderId, topicIds: [topicContextId] });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_capture_organization", {
      p_capture_id: captureId,
      p_actor_user_id: userId,
      p_folder_id_provided: true,
      p_folder_id: folderId,
      p_topic_ids: [topicContextId],
    });
  });

  it("creates a manual topic through the actor RLS boundary", async () => {
    const actorQuery = query({
      id: topicContextId,
      workspace_id: workspaceId,
      kind: "topic",
      label: "Learning",
      normalized_value: "learning",
      metadata: { source: "manual" },
      created_at: "2026-07-16T00:00:00.000Z",
    });
    const actorFrom = vi.fn().mockReturnValue(actorQuery);
    const serviceFrom = vi.fn();

    await expect(
      createTopicRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        { workspaceId, label: "Learning" },
      ),
    ).resolves.toMatchObject({
      id: topicContextId,
      workspaceId,
      label: "Learning",
    });

    expect(actorFrom).toHaveBeenCalledWith("contexts");
    expect(actorQuery.insert).toHaveBeenCalledWith(
      {
        workspace_id: workspaceId,
        kind: "topic",
        label: "Learning",
        normalized_value: "learning",
        metadata: { source: "manual" },
      },
    );
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("renames and deletes a folder only after actor membership is checked", async () => {
    const folder = {
      id: folderId,
      workspace_id: workspaceId,
      parent_id: null,
      name: "Old",
      sort_order: 0,
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    };
    const renamed = { ...folder, name: "New" };
    const serviceFrom = vi
      .fn()
      .mockReturnValueOnce(query(folder))
      .mockReturnValueOnce(query(renamed))
      .mockReturnValueOnce(query(folder))
      .mockReturnValueOnce(query(null));
    const actorFrom = vi.fn().mockReturnValue(query({ role: "editor" }));
    const clients = {
      actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
      service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
      userId,
    };

    await expect(
      renameFolderRecord(clients, { folderId, name: "New" }),
    ).resolves.toMatchObject({ id: folderId, name: "New" });
    await expect(deleteFolderRecord(clients, { folderId })).resolves.toEqual({
      folderId,
      workspaceId,
    });
    expect(actorFrom).toHaveBeenCalledTimes(2);
  });

  it("groups topic assignments by capture id", async () => {
    const actorQuery = query([
      { capture_id: captureId, topic_context_id: topicContextId },
    ]);
    await expect(
      listCaptureTopicAssignments(
        {
          actor: {
            from: vi.fn().mockReturnValue(actorQuery),
          } as unknown as SupabaseClient<Database>,
          service: {} as SupabaseClient<Database>,
          userId,
        },
        { workspaceId, captureIds: [captureId] },
      ),
    ).resolves.toEqual({ [captureId]: [topicContextId] });
  });

  it("rejects viewer folder creation before a service-role write", async () => {
    const serviceFrom = vi.fn();
    const actorFrom = vi.fn().mockReturnValue(query({ role: "viewer" }));

    await expect(
      createFolderRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        { workspaceId, name: "Research", sortOrder: 0 },
      ),
    ).rejects.toMatchObject({ code: "ORGANIZATION_WRITE_FORBIDDEN", status: 403 });

    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it("rejects moving a capture into a folder from another workspace", async () => {
    const captureQuery = query({ id: captureId, workspace_id: workspaceId, folder_id: null });
    const missingFolderQuery = query(null);
    const serviceFrom = vi
      .fn()
      .mockReturnValueOnce(captureQuery)
      .mockReturnValueOnce(missingFolderQuery);
    const actorFrom = vi.fn().mockReturnValue(query({ role: "editor" }));

    await expect(
      moveCaptureToFolderRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        { captureId, folderId },
      ),
    ).rejects.toMatchObject({ code: "ORGANIZATION_RESOURCE_NOT_FOUND", status: 404 });
  });

  it("requires an existing topic context in the capture workspace", async () => {
    const captureQuery = query({ id: captureId, workspace_id: workspaceId, folder_id: null });
    const missingTopicQuery = query(null);
    const serviceFrom = vi
      .fn()
      .mockReturnValueOnce(captureQuery)
      .mockReturnValueOnce(missingTopicQuery);
    const actorFrom = vi.fn().mockReturnValue(query({ role: "owner" }));

    await expect(
      assignCaptureTopicRecord(
        {
          actor: { from: actorFrom } as unknown as SupabaseClient<Database>,
          service: { from: serviceFrom } as unknown as SupabaseClient<Database>,
          userId,
        },
        { captureId, topicContextId },
      ),
    ).rejects.toMatchObject({ code: "ORGANIZATION_RESOURCE_NOT_FOUND", status: 404 });
  });

  it("filters calendar records directly by capture created_at", async () => {
    const captureQuery = query([
      {
        id: captureId,
        workspace_id: workspaceId,
        folder_id: folderId,
        title: "Capture",
        source_kind: "paste",
        created_at: "2026-07-15T00:00:00.000Z",
      },
    ]);

    await expect(
      listCalendarCaptureRecords(
        {
          actor: {
            from: vi.fn().mockReturnValue(captureQuery),
          } as unknown as SupabaseClient<Database>,
          service: {} as SupabaseClient<Database>,
          userId,
        },
        {
          workspaceId,
          folderId,
          from: "2026-07-01T00:00:00Z",
          toExclusive: "2026-08-01T00:00:00Z",
          limit: 50,
        },
      ),
    ).resolves.toEqual({
      records: [expect.objectContaining({ id: captureId, folderId })],
      totalCount: 1,
      hasMore: false,
    });

    expect(captureQuery.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-07-01T00:00:00Z",
    );
    expect(captureQuery.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-08-01T00:00:00Z",
    );
    expect(captureQuery.eq).toHaveBeenCalledWith("folder_id", folderId);
    expect(captureQuery.limit).toHaveBeenCalledWith(50);
  });
});
