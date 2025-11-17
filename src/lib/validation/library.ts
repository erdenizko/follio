import { z } from "zod";

export const saveCoverVersionSchema = z.object({
  jobId: z.string().min(1, "A job id is required."),
  selectedImageUrl: z.string().url().optional(),
});

export type SaveCoverVersionInput = z.infer<typeof saveCoverVersionSchema>;

