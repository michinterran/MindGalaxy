import { describe, expect, it, vi } from "vitest";
import {
  applyCaptureOrganization,
  captureOrganizationSnapshot,
  shouldAutoOpenKnowledge,
} from "@/features/library-organizer/model/capture-organization";
import type { LibraryOrganizerActions } from "@/features/library-organizer/model/types";

function actions(): LibraryOrganizerActions {
  return {
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveCapture: vi.fn().mockResolvedValue(undefined),
    createTopic: vi.fn(),
    setCaptureTopics: vi.fn().mockResolvedValue(undefined),
    updateCaptureOrganization: vi.fn().mockResolvedValue(undefined),
  };
}

describe("capture organization", () => {
  it("applies the selected folder and topics to the created capture id", async () => {
    const api = actions();

    await applyCaptureOrganization(api, "capture-1", {
      folderId: "folder-1",
      topicIds: ["topic-1", "topic-2"],
    });

    expect(api.updateCaptureOrganization).toHaveBeenCalledWith("capture-1", {
      folderId: "folder-1",
      topicIds: ["topic-1", "topic-2"],
    });
  });

  it("does not make organization writes when no destination was selected", async () => {
    const api = actions();
    await applyCaptureOrganization(api, "capture-1", { folderId: null, topicIds: [] });
    expect(api.moveCapture).not.toHaveBeenCalled();
    expect(api.setCaptureTopics).not.toHaveBeenCalled();
    expect(api.updateCaptureOrganization).not.toHaveBeenCalled();
  });

  it("keeps a retry snapshot independent from later form changes", () => {
    const value = { folderId: "folder-1", topicIds: ["topic-1"] };
    const snapshot = captureOrganizationSnapshot(value);
    value.folderId = "folder-2";
    value.topicIds.push("topic-2");
    expect(snapshot).toEqual({ folderId: "folder-1", topicIds: ["topic-1"] });
  });

  it("keeps the hero open for a failed assignment and permits navigation after retry", () => {
    expect(shouldAutoOpenKnowledge(true)).toBe(false);
    expect(shouldAutoOpenKnowledge(false)).toBe(true);
  });
});
