import type { LibraryOrganizerActions } from "@/features/library-organizer/model/types";

export type CaptureOrganizationValue = {
  folderId: string | null;
  topicIds: string[];
};

export async function applyCaptureOrganization(
  actions: LibraryOrganizerActions,
  captureId: string,
  value: CaptureOrganizationValue,
) {
  if (!value.folderId && !value.topicIds.length) return;
  await actions.updateCaptureOrganization(captureId, {
    folderId: value.folderId,
    topicIds: value.topicIds,
  });
}

export function captureOrganizationSnapshot(value: CaptureOrganizationValue): CaptureOrganizationValue {
  return { folderId: value.folderId, topicIds: [...value.topicIds] };
}

export function shouldAutoOpenKnowledge(organizationFailed: boolean) {
  return !organizationFailed;
}
