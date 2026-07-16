import type {
  LibraryOrganizerActions,
  OrganizerSnapshot,
  OrganizerTopic,
} from "@/features/library-organizer/model/types";
import type { FolderRecord } from "@/features/library/model/organization";

export class LibraryOrganizerClientError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "LibraryOrganizerClientError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body === undefined ? init?.headers : { "content-type": "application/json", ...init.headers },
  });
  const body = (await response.json().catch(() => null)) as ({ error?: string } & Record<string, unknown>) | null;
  if (!response.ok) throw new LibraryOrganizerClientError(body?.error ?? "ORGANIZATION_REQUEST_FAILED", response.status);
  return body as T;
}

export async function loadLibraryOrganizer(input: {
  workspaceId: string;
  from: string;
  toExclusive: string;
  folderId?: string;
  topicId?: string;
}, init?: Pick<RequestInit, "signal">): Promise<OrganizerSnapshot> {
  const params = new URLSearchParams({
    workspaceId: input.workspaceId,
    from: input.from,
    toExclusive: input.toExclusive,
  });
  if (input.folderId) params.set("folderId", input.folderId);
  if (input.topicId) params.set("topicId", input.topicId);
  return request(`/api/library-organizer?${params.toString()}`, init);
}

export function createLibraryOrganizerActions(workspaceId: string): LibraryOrganizerActions {
  return {
    async createFolder(input) {
      const result = await request<{ folder: FolderRecord }>("/api/library-organizer/folders", {
        method: "POST",
        body: JSON.stringify({ workspaceId, ...input }),
      });
      return { ...result.folder, captureCount: 0 };
    },
    async renameFolder(folderId, name) {
      const result = await request<{ folder: FolderRecord }>(
        `/api/library-organizer/folders/${encodeURIComponent(folderId)}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      return { ...result.folder, captureCount: 0 };
    },
    async deleteFolder(folderId) {
      await request(`/api/library-organizer/folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
    },
    async moveCapture(captureId, folderId) {
      await request(`/api/library-organizer/captures/${encodeURIComponent(captureId)}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId }),
      });
    },
    async createTopic(label) {
      const result = await request<{ topic: OrganizerTopic }>("/api/library-organizer/topics", {
        method: "POST",
        body: JSON.stringify({ workspaceId, label }),
      });
      return result.topic;
    },
    async setCaptureTopics(captureId, topicIds) {
      await request(`/api/library-organizer/captures/${encodeURIComponent(captureId)}`, {
        method: "PATCH",
        body: JSON.stringify({ topicIds }),
      });
    },
    async updateCaptureOrganization(captureId, input) {
      await request(`/api/library-organizer/captures/${encodeURIComponent(captureId)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
  };
}

/**
 * Library organization is also part of the server-rendered graph projection.
 * Keep the local organizer response fast, then invalidate the RSC snapshot only
 * after the database mutation has completed successfully.
 */
export function withLibraryOrganizerInvalidation(
  actions: LibraryOrganizerActions,
  invalidate: () => void,
): LibraryOrganizerActions {
  return {
    async createFolder(input) {
      const folder = await actions.createFolder(input);
      invalidate();
      return folder;
    },
    async renameFolder(folderId, name) {
      const folder = await actions.renameFolder(folderId, name);
      invalidate();
      return folder;
    },
    async deleteFolder(folderId) {
      await actions.deleteFolder(folderId);
      invalidate();
    },
    async moveCapture(captureId, folderId) {
      await actions.moveCapture(captureId, folderId);
      invalidate();
    },
    async createTopic(label) {
      const topic = await actions.createTopic(label);
      invalidate();
      return topic;
    },
    async setCaptureTopics(captureId, topicIds) {
      await actions.setCaptureTopics(captureId, topicIds);
      invalidate();
    },
    async updateCaptureOrganization(captureId, input) {
      await actions.updateCaptureOrganization(captureId, input);
      invalidate();
    },
  };
}
