import { describe, expect, it } from "vitest";
import {
  assignCaptureTopicInputSchema,
  captureTopicAssignmentsInputSchema,
  captureCalendarFilterSchema,
  createFolderInputSchema,
  createTopicInputSchema,
  renameFolderInputSchema,
} from "@/features/library/model/organization";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const captureId = "22222222-2222-4222-8222-222222222222";
const topicContextId = "33333333-3333-4333-8333-333333333333";

describe("library organization contracts", () => {
  it("normalizes folder names and applies a stable sort default", () => {
    expect(
      createFolderInputSchema.parse({ workspaceId, name: "  Research  " }),
    ).toEqual({
      workspaceId,
      name: "Research",
      sortOrder: 0,
    });
  });

  it("keeps topic assignment distinct from folder placement", () => {
    expect(
      assignCaptureTopicInputSchema.parse({ captureId, topicContextId }),
    ).toEqual({ captureId, topicContextId });
    expect(
      assignCaptureTopicInputSchema.safeParse({
        captureId,
        topicContextId,
        folderId: workspaceId,
      }).success,
    ).toBe(false);
    expect(
      createTopicInputSchema.parse({ workspaceId, label: "  Learning  " }),
    ).toEqual({ workspaceId, label: "Learning" });
    expect(
      renameFolderInputSchema.parse({ folderId: workspaceId, name: "  Work  " }),
    ).toEqual({ folderId: workspaceId, name: "Work" });
    expect(
      captureTopicAssignmentsInputSchema.parse({
        workspaceId,
        captureIds: [captureId],
      }),
    ).toEqual({ workspaceId, captureIds: [captureId] });
  });

  it("accepts bounded calendar filters over capture created_at", () => {
    expect(
      captureCalendarFilterSchema.parse({
        workspaceId,
        from: "2026-07-01T00:00:00+09:00",
        toExclusive: "2026-08-01T00:00:00+09:00",
      }),
    ).toMatchObject({ workspaceId, limit: 50 });
  });

  it("rejects inverted and unbounded calendar ranges", () => {
    expect(
      captureCalendarFilterSchema.safeParse({
        workspaceId,
        from: "2026-08-01T00:00:00Z",
        toExclusive: "2026-07-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      captureCalendarFilterSchema.safeParse({
        workspaceId,
        from: "2026-01-01T00:00:00Z",
        toExclusive: "2028-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});
