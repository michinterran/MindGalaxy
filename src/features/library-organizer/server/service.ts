import "server-only";

import type { LibraryClients } from "@/features/library/server/dal";
import {
  createFolderRecord,
  createTopicRecord,
  deleteFolderRecord,
  listCalendarCaptureRecords,
  listCaptureTopicAssignments,
  listFolderRecords,
  listTopicRecords,
  renameFolderRecord,
  updateCaptureOrganizationRecord,
} from "@/features/library/server/organization";
import type { OrganizerSnapshot } from "@/features/library-organizer/model/types";

export async function loadOrganizerSnapshot(
  clients: LibraryClients,
  input: {
    workspaceId: string;
    from: string;
    toExclusive: string;
    folderId?: string;
    topicId?: string;
  },
): Promise<OrganizerSnapshot> {
  const [folders, topics, capturePage] = await Promise.all([
    listFolderRecords(clients, input.workspaceId),
    listTopicRecords(clients, input.workspaceId),
    listCalendarCaptureRecords(clients, {
      workspaceId: input.workspaceId,
      from: input.from,
      toExclusive: input.toExclusive,
      folderId: input.folderId,
      topicContextId: input.topicId,
      limit: 100,
    }),
  ]);
  const captures = capturePage.records;
  const captureIds = captures.map((capture) => capture.id);
  const assignments = captureIds.length
    ? await listCaptureTopicAssignments(clients, {
        workspaceId: input.workspaceId,
        captureIds,
      })
    : {};
  const topicCounts = new Map<string, number>();
  for (const topicIds of Object.values(assignments)) {
    for (const topicId of topicIds) {
      topicCounts.set(topicId, (topicCounts.get(topicId) ?? 0) + 1);
    }
  }
  const folderCounts = new Map<string, number>();
  captures.forEach((capture) => {
    if (capture.folderId) folderCounts.set(capture.folderId, (folderCounts.get(capture.folderId) ?? 0) + 1);
  });

  return {
    hasMore: capturePage.hasMore,
    totalCaptureCount: capturePage.totalCount,
    folders: folders.map((folder) => ({ ...folder, captureCount: folderCounts.get(folder.id) ?? 0 })),
    topics: topics.map((topic) => ({ id: topic.id, label: topic.label, captureCount: topicCounts.get(topic.id) ?? 0 })),
    captures: captures.map((capture) => ({
      id: capture.id,
      title: capture.title,
      sourceKind: capture.sourceKind,
      createdAt: capture.createdAt,
      folderId: capture.folderId,
      topicIds: assignments[capture.id] ?? [],
      rawTextPreview: null,
    })),
  };
}

export function createOrganizerFolder(
  clients: LibraryClients,
  input: { workspaceId: string; parentId: string | null; name: string },
) {
  return createFolderRecord(clients, { ...input, sortOrder: 0 });
}

export function createOrganizerTopic(
  clients: LibraryClients,
  input: { workspaceId: string; label: string },
) {
  return createTopicRecord(clients, input);
}

export async function renameOrganizerFolder(
  clients: LibraryClients,
  folderId: string,
  name: string,
) {
  return renameFolderRecord(clients, { folderId, name });
}

export async function deleteOrganizerFolder(clients: LibraryClients, folderId: string) {
  await deleteFolderRecord(clients, { folderId });
}

export async function updateCaptureOrganization(
  clients: LibraryClients,
  captureId: string,
  input: { folderId?: string | null; topicIds?: string[] },
) {
  return updateCaptureOrganizationRecord(clients, { captureId, ...input });
}
