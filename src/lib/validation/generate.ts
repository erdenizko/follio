import { z } from "zod";

export const imageRoleSchema = z.enum(["background", "mascot", "logo", "none"]);

export const generationImageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    uploadUrl: z.string().url().optional(),
    base64: z
      .string()
      .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/)
      .optional(),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    sizeBytes: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .refine(
    (value) => value.uploadUrl || value.base64,
    "Either uploadUrl or base64 is required.",
  );

export const createGenerationSchema = z.object({
  projectName: z
    .string()
    .min(3, "Name must be at least 3 characters.")
    .max(80, "Name must be 80 characters or fewer."),
  aspectRatioId: z.string().min(1),
  customWidth: z.number().int().positive().nullable(),
  customHeight: z.number().int().positive().nullable(),
  images: z
    .array(generationImageSchema)
    .min(1, "At least 1 image is required.")
    .max(3, "Maximum 3 images are allowed."),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type GenerationImageInput = z.infer<typeof generationImageSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;

