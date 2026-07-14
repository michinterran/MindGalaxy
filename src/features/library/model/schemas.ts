import { z } from "zod";

export const libraryIdSchema = z.uuid();

export const updateCaptureTitleInputSchema = z
  .object({
    title: z.string().trim().max(200).nullable(),
  })
  .strict();

export type UpdateCaptureTitleInput = z.infer<
  typeof updateCaptureTitleInputSchema
>;
