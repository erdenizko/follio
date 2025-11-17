import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { GenerationImageWithCloudinary } from "@/lib/cloudinary";
import type { SanitizedImageMetadata } from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import type { GenerationImageInput } from "@/lib/validation/generate";

export type GalleryUpload = {
  original: GenerationImageInput;
  uploaded: GenerationImageWithCloudinary;
  metadata: SanitizedImageMetadata;
};

export type GalleryUploadContext = {
  userId: string;
  jobId?: string;
  projectName?: string | null;
  projectSlug?: string | null;
  aspectRatioId?: string | null;
  aspectRatioString?: string | null;
  projectId?: string | null;
  isSourceAsset?: boolean;
};

function computeImageChecksum(image: GenerationImageInput): string {
  const hash = createHash("sha256");

  if (image.base64) {
    hash.update(image.base64);
  } else if (image.uploadUrl) {
    hash.update(image.uploadUrl);
  } else {
    hash.update(image.id);
  }

  return hash.digest("hex");
}

export async function persistGalleryUploads(
  context: GalleryUploadContext,
  uploads: GalleryUpload[],
) {
  if (!uploads.length) {
    return;
  }

  const rows = uploads
    .map(({ original, uploaded, metadata }) => {
      if (!uploaded.uploadUrl) {
        return null;
      }

      const checksum = computeImageChecksum(original);
      const cloudinary = uploaded.cloudinary;

      return {
        userId: context.userId,
        jobId: context.jobId,
        projectId: context.projectId ?? null,
        projectName: context.projectName ?? null,
        projectSlug: context.projectSlug ?? null,
        aspectRatioId: context.aspectRatioId ?? null,
        aspectRatioString: context.aspectRatioString ?? null,
        isSourceAsset: Boolean(context.isSourceAsset),
        uploadUrl: uploaded.uploadUrl,
        checksum,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        metadata: metadata as Prisma.InputJsonValue,
        cloudinaryPublicId: cloudinary?.publicId ?? null,
        cloudinaryAssetId: cloudinary?.assetId ?? null,
        cloudinaryFolder: cloudinary?.folder ?? null,
        cloudinaryVersion: cloudinary?.version ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!rows.length) {
    return;
  }

  try {
    await prisma.galleryImage.createMany({
      data: rows,
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("[gallery] failed to persist uploads", error);
  }
}

