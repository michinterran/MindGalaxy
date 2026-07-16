import { z } from "zod";

export const ORGANIZATION_LIMITS = {
  maxFolderNameLength: 120,
  defaultCalendarLimit: 50,
  maxCalendarLimit: 100,
  maxCalendarRangeDays: 366,
} as const;

const organizationIdSchema = z.uuid();

export const createFolderInputSchema = z
  .object({
    workspaceId: organizationIdSchema,
    parentId: organizationIdSchema.nullable().optional(),
    name: z.string().trim().min(1).max(ORGANIZATION_LIMITS.maxFolderNameLength),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export const createTopicInputSchema = z
  .object({
    workspaceId: organizationIdSchema,
    label: z.string().trim().min(1).max(120),
  })
  .strict();

export const renameFolderInputSchema = z
  .object({
    folderId: organizationIdSchema,
    name: z.string().trim().min(1).max(ORGANIZATION_LIMITS.maxFolderNameLength),
  })
  .strict();

export const deleteFolderInputSchema = z
  .object({ folderId: organizationIdSchema })
  .strict();

export const captureTopicAssignmentsInputSchema = z
  .object({
    workspaceId: organizationIdSchema,
    captureIds: z.array(organizationIdSchema).min(1).max(100),
  })
  .strict();

export const moveCaptureToFolderInputSchema = z
  .object({
    captureId: organizationIdSchema,
    folderId: organizationIdSchema.nullable(),
  })
  .strict();

export const assignCaptureTopicInputSchema = z
  .object({
    captureId: organizationIdSchema,
    topicContextId: organizationIdSchema,
  })
  .strict();

export const captureCalendarFilterSchema = z
  .object({
    workspaceId: organizationIdSchema,
    folderId: organizationIdSchema.nullable().optional(),
    topicContextId: organizationIdSchema.optional(),
    from: z.iso.datetime({ offset: true }),
    toExclusive: z.iso.datetime({ offset: true }),
    limit: z
      .number()
      .int()
      .min(1)
      .max(ORGANIZATION_LIMITS.maxCalendarLimit)
      .default(ORGANIZATION_LIMITS.defaultCalendarLimit),
  })
  .strict()
  .superRefine((value, context) => {
    const from = Date.parse(value.from);
    const toExclusive = Date.parse(value.toExclusive);

    if (toExclusive <= from) {
      context.addIssue({
        code: "custom",
        message: "CALENDAR_RANGE_INVALID",
        path: ["toExclusive"],
      });
      return;
    }

    const rangeDays = (toExclusive - from) / 86_400_000;
    if (rangeDays > ORGANIZATION_LIMITS.maxCalendarRangeDays) {
      context.addIssue({
        code: "custom",
        message: "CALENDAR_RANGE_TOO_LARGE",
        path: ["toExclusive"],
      });
    }
  });

export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;
export type CreateTopicInput = z.infer<typeof createTopicInputSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderInputSchema>;
export type DeleteFolderInput = z.infer<typeof deleteFolderInputSchema>;
export type CaptureTopicAssignmentsInput = z.infer<
  typeof captureTopicAssignmentsInputSchema
>;
export type MoveCaptureToFolderInput = z.infer<typeof moveCaptureToFolderInputSchema>;
export type AssignCaptureTopicInput = z.infer<typeof assignCaptureTopicInputSchema>;
export type CaptureCalendarFilter = z.infer<typeof captureCalendarFilterSchema>;

export type FolderRecord = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TopicRecord = {
  id: string;
  workspaceId: string;
  label: string;
  normalizedValue: string | null;
  createdAt: string;
};

export type CalendarCaptureRecord = {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string | null;
  sourceKind: string;
  createdAt: string;
};

export type CalendarCapturePage = {
  records: CalendarCaptureRecord[];
  totalCount: number;
  hasMore: boolean;
};
