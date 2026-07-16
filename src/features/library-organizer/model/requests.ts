import { z } from "zod";

const id = z.uuid();

export const organizerQuerySchema = z.object({
  workspaceId: id,
  from: z.iso.datetime({ offset: true }),
  toExclusive: z.iso.datetime({ offset: true }),
  folderId: id.optional(),
  topicId: id.optional(),
});

export const createOrganizerFolderSchema = z.object({
  workspaceId: id,
  parentId: id.nullable().default(null),
  name: z.string().trim().min(1).max(120),
});

export const updateOrganizerFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const createOrganizerTopicSchema = z.object({
  workspaceId: id,
  label: z.string().trim().min(1).max(120),
});

export const updateCaptureOrganizationSchema = z
  .object({
    folderId: id.nullable().optional(),
    topicIds: z.array(id).max(32).optional(),
  })
  .refine((value) => value.folderId !== undefined || value.topicIds !== undefined, {
    message: "ORGANIZATION_UPDATE_REQUIRED",
  });
