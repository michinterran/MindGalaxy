import type { FolderRecord } from "@/features/library/model/organization";

export type OrganizerFolder = FolderRecord & {
  captureCount: number;
};

export type OrganizerTopic = {
  id: string;
  label: string;
  captureCount: number;
};

export type OrganizerCapture = {
  id: string;
  title: string | null;
  sourceKind: string;
  createdAt: string;
  folderId: string | null;
  topicIds: string[];
  rawTextPreview?: string | null;
};

export type OrganizerSnapshot = {
  folders: OrganizerFolder[];
  topics: OrganizerTopic[];
  captures: OrganizerCapture[];
  hasMore: boolean;
  totalCaptureCount: number;
};

export type OrganizerFilter = {
  date: string | null;
  folderId: string | null;
  topicId: string | null;
};

export type LibraryOrganizerActions = {
  createFolder(input: { name: string; parentId: string | null }): Promise<OrganizerFolder>;
  renameFolder(folderId: string, name: string): Promise<OrganizerFolder>;
  deleteFolder(folderId: string): Promise<void>;
  moveCapture(captureId: string, folderId: string | null): Promise<void>;
  createTopic(label: string): Promise<OrganizerTopic>;
  setCaptureTopics(captureId: string, topicIds: string[]): Promise<void>;
  updateCaptureOrganization(
    captureId: string,
    input: { folderId?: string | null; topicIds?: string[] },
  ): Promise<void>;
};
