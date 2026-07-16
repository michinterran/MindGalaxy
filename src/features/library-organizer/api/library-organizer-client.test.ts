import { describe, expect, it, vi } from "vitest";
import { withLibraryOrganizerInvalidation } from "@/features/library-organizer/api/library-organizer-client";
import type { LibraryOrganizerActions } from "@/features/library-organizer/model/types";

const folder = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  parentId: null,
  name: "Research",
  sortOrder: 0,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
  captureCount: 0,
};

function actions(): LibraryOrganizerActions {
  return {
    createFolder: vi.fn().mockResolvedValue(folder),
    renameFolder: vi.fn().mockResolvedValue(folder),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
    moveCapture: vi.fn().mockResolvedValue(undefined),
    createTopic: vi.fn().mockResolvedValue({ id: folder.id, label: "AI", captureCount: 0 }),
    setCaptureTopics: vi.fn().mockResolvedValue(undefined),
    updateCaptureOrganization: vi.fn().mockResolvedValue(undefined),
  };
}

describe("withLibraryOrganizerInvalidation", () => {
  it("invalidates the server graph after every successful organization mutation", async () => {
    const invalidate = vi.fn();
    const wrapped = withLibraryOrganizerInvalidation(actions(), invalidate);

    await wrapped.createFolder({ name: "Research", parentId: null });
    await wrapped.renameFolder(folder.id, "AI Research");
    await wrapped.moveCapture(folder.id, folder.id);
    await wrapped.setCaptureTopics(folder.id, [folder.id]);
    await wrapped.createTopic("AI");
    await wrapped.updateCaptureOrganization(folder.id, {
      folderId: folder.id,
      topicIds: [folder.id],
    });
    await wrapped.deleteFolder(folder.id);

    expect(invalidate).toHaveBeenCalledTimes(7);
  });

  it("does not refresh the graph when the database mutation fails", async () => {
    const base = actions();
    vi.mocked(base.moveCapture).mockRejectedValueOnce(new Error("MOVE_FAILED"));
    const invalidate = vi.fn();
    const wrapped = withLibraryOrganizerInvalidation(base, invalidate);

    await expect(wrapped.moveCapture(folder.id, null)).rejects.toThrow("MOVE_FAILED");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
