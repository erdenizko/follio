import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureImagesHaveCloudinaryUrls } from "@/lib/cloudinary";
import { persistGalleryUploads } from "@/lib/gallery";
import { sanitizeImageMetadata } from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import type { GenerationImageInput } from "@/lib/validation/generate";

// Configure route
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for processing
export const dynamic = 'force-dynamic';

const MAX_IMAGES_PER_ARCHIVE = 60;

type ProjectGroup = {
  slug: string;
  name: string;
  inputs: GenerationImageInput[];
};

type BatchUploadRequest = {
  projects: Array<{
    slug: string;
    name: string;
    inputs: GenerationImageInput[];
  }>;
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse JSON body (metadata with Cloudinary URLs)
  const body = await request.json().catch(() => null);
  if (!body || !body.projects || !Array.isArray(body.projects)) {
    return NextResponse.json(
      { error: "InvalidRequest", details: "Expected JSON body with projects array." },
      { status: 400 },
    );
  }

  const requestData = body as BatchUploadRequest;
  const projectGroups = new Map<string, ProjectGroup>();

  // Convert request data to ProjectGroup format
  for (const project of requestData.projects) {
    // Validate that all images have uploadUrl (required to prevent 413 errors)
    const imagesWithoutUploadUrl = project.inputs.filter((img) => !img.uploadUrl);
    if (imagesWithoutUploadUrl.length > 0) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: `Project "${project.name}" has ${imagesWithoutUploadUrl.length} image(s) missing uploadUrl.`,
        },
        { status: 400 },
      );
    }

    projectGroups.set(project.slug, {
      slug: project.slug,
      name: project.name,
      inputs: project.inputs,
    });
  }

  const totalImages = Array.from(projectGroups.values()).reduce(
    (acc, group) => acc + group.inputs.length,
    0,
  );

  if (totalImages === 0) {
    return NextResponse.json(
      {
        error: "NoImages",
        details: "No supported images were found under project folders.",
      },
      { status: 400 },
    );
  }

  if (totalImages > MAX_IMAGES_PER_ARCHIVE) {
    return NextResponse.json(
      {
        error: "TooManyImages",
        details: `Upload up to ${MAX_IMAGES_PER_ARCHIVE} images per archive.`,
      },
      { status: 400 },
    );
  }

  try {
    let projectsProcessed = 0;
    let projectsCreated = 0;
    let assetsImported = 0;

    for (const group of projectGroups.values()) {
      if (!group.inputs.length) continue;

      projectsProcessed += 1;

      const uploadedImages = await ensureImagesHaveCloudinaryUrls(group.inputs, {
        userId: session.user.id,
      });
      const sanitized = uploadedImages.map(sanitizeImageMetadata);

      const primaryAssetUrl = uploadedImages[0]?.uploadUrl;
      if (!primaryAssetUrl) {
        throw new Error("Unable to resolve Cloudinary URL for the first asset.");
      }

      const sourceImageUrls: Array<string | null> = [
        uploadedImages[0]?.uploadUrl ?? null,
        uploadedImages[1]?.uploadUrl ?? null,
        uploadedImages[2]?.uploadUrl ?? null,
      ];

      const project = await prisma.$transaction(async (tx) => {
        const existingProject = await tx.coverProject.findUnique({
          where: {
            userId_slug: {
              userId: session.user.id,
              slug: group.slug,
            },
          },
        });

        let projectRecord =
          existingProject ??
          (await tx.coverProject.create({
            data: {
              userId: session.user.id,
              name: group.name,
              slug: group.slug,
              latestVersionNumber: 0,
            },
          }));

        const nextVersionNumber = projectRecord.latestVersionNumber + 1;

        await tx.coverVersion.create({
          data: {
            projectId: projectRecord.id,
            thumbnailJobId: null,
            versionNumber: nextVersionNumber,
            label: `${projectRecord.slug}_v${nextVersionNumber}`,
            selectedImageUrl: '',
            sourceImage1Url: sourceImageUrls[0],
            sourceImage2Url: sourceImageUrls[1],
            sourceImage3Url: sourceImageUrls[2],
          },
        });

        projectRecord = await tx.coverProject.update({
          where: { id: projectRecord.id },
          data: {
            name: group.name,
            latestVersionNumber: nextVersionNumber,
            librarySelected: true,
            libraryGenerationStatus: "WAITING",
            libraryGenerationJobId: null,
            libraryGenerationQueuedAt: null,
            libraryGenerationCompletedAt: null,
          },
        });

        return {
          record: projectRecord,
          created: !existingProject,
        };
      });

      if (project.created) {
        projectsCreated += 1;
      }

      const galleryUploads = uploadedImages.map((uploaded, index) => ({
        original: group.inputs[index]!,
        uploaded,
        metadata: sanitized[index]!,
      }));

      await persistGalleryUploads(
        {
          userId: session.user.id,
          projectId: project.record.id,
          projectName: project.record.name,
          projectSlug: project.record.slug,
          isSourceAsset: true,
        },
        galleryUploads,
      );

      assetsImported += uploadedImages.length;
    }

    return NextResponse.json(
      {
        success: true,
        stats: {
          projects: projectsProcessed,
          projectsCreated,
          assets: assetsImported,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[library/batch-upload] failed", error);
    return NextResponse.json(
      {
        error: "BatchUploadFailed",
        details: error instanceof Error ? error.message : "Unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}


