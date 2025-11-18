import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { CUSTOM_ASPECT_RATIO_ID, DEFAULT_ASPECT_RATIO_ID, resolveAspectRatioString } from "@/lib/aspect-ratios";
import { auth } from "@/lib/auth";
import {
  ensureImagesHaveCloudinaryUrls,
  uploadGeneratedImageToCloudinary,
} from "@/lib/cloudinary";
import { extractResultUrls } from "@/lib/fal-results";
import { runFalWorkflow } from "@/lib/fal";
import {
  buildFalWorkflowInput,
  sanitizeImageMetadata,
} from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import type { GenerationImageInput } from "@/lib/validation/generate";

const REQUIRED_IMAGE_COUNT = 3;

const requestSchema = z.object({
  projectIds: z.array(z.string().min(1)).min(1, "Select at least one project."),
});

type ProjectWithAssets = Awaited<ReturnType<typeof fetchProjects>>[number];

async function fetchProjects(userId: string, projectIds?: string[]) {
  const where: Prisma.CoverProjectWhereInput = {
    userId,
    libraryGenerationStatus: {
      in: ["WAITING", "FAILED"],
    },
  };

  if (projectIds?.length) {
    where.id = {
      in: projectIds,
    };
  }

  return prisma.coverProject.findMany({
    where,
    include: {
      galleryImages: {
        where: {
          isSourceAsset: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      versions: {
        orderBy: {
          versionNumber: "desc",
        },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          sourceImage1Url: true,
          sourceImage2Url: true,
          sourceImage3Url: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

function buildInputsFromAssets(project: ProjectWithAssets): GenerationImageInput[] {
  const galleryInputs = project.galleryImages
    .filter((asset) => asset.uploadUrl) // Filter out assets without uploadUrl
    .slice(0, REQUIRED_IMAGE_COUNT)
    .map((asset, index) => ({
      id: `${asset.id}-${index}`,
      name:
        asset.metadata &&
        typeof asset.metadata === "object" &&
        "name" in (asset.metadata as Record<string, unknown>)
          ? String((asset.metadata as { name?: string }).name)
          : `${project.slug}-source-${index + 1}`,
      uploadUrl: asset.uploadUrl,
      mimeType: (asset.mimeType as GenerationImageInput["mimeType"]) ?? "image/png",
      sizeBytes: asset.sizeBytes,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    }));

  let base = galleryInputs;

  if (!base.length) {
    const latestVersion = project.versions?.[0];
    const versionSources = latestVersion
      ? [latestVersion.sourceImage1Url, latestVersion.sourceImage2Url, latestVersion.sourceImage3Url].filter(
          (value): value is string => typeof value === "string" && Boolean(value),
        )
      : [];

    if (versionSources.length) {
      base = versionSources.slice(0, REQUIRED_IMAGE_COUNT).map((url, index) => ({
        id: `${project.id}-source-${index}`,
        name: `${project.slug}-source-${index + 1}`,
        uploadUrl: url,
        mimeType: "image/png",
        sizeBytes: 0,
        width: undefined,
        height: undefined,
      }));
    }
  }

  if (!base.length) {
    return [];
  }

  const padded = [...base];

  while (padded.length < REQUIRED_IMAGE_COUNT) {
    const last = padded[padded.length - 1]!;
    padded.push({
      ...last,
      id: `${last.id}-dup${padded.length}`,
    });
  }

  return padded;
}

function deriveAspectRatio(inputs: GenerationImageInput[]) {
  const first = inputs[0];
  if (first?.width && first?.height) {
    return {
      aspectRatioId: CUSTOM_ASPECT_RATIO_ID,
      aspectRatioString: resolveAspectRatioString(CUSTOM_ASPECT_RATIO_ID, {
        width: first.width,
        height: first.height,
      }),
      customWidth: first.width,
      customHeight: first.height,
    };
  }

  return {
    aspectRatioId: DEFAULT_ASPECT_RATIO_ID,
    aspectRatioString: resolveAspectRatioString(DEFAULT_ASPECT_RATIO_ID),
    customWidth: null,
    customHeight: null,
  };
}

async function runGenerationForProject(project: ProjectWithAssets, userId: string) {
  let jobId: string | null = null;
  const startedAt = new Date();

  try {
    const inputs = buildInputsFromAssets(project);
    if (!inputs.length) {
      throw new Error("No source images available for this project.");
    }

    const aspectRatio = deriveAspectRatio(inputs);
    const uploadedInputs = await ensureImagesHaveCloudinaryUrls(inputs, {
      userId,
    });

    // Validate that all images have uploadUrl
    const missingUrls = uploadedInputs.filter((img) => !img.uploadUrl);
    if (missingUrls.length > 0) {
      throw new Error(
        `${missingUrls.length} image(s) are missing uploadUrl after Cloudinary upload.`,
      );
    }

    const sanitized = uploadedInputs.map(sanitizeImageMetadata);

    const placeholders = [
      sanitized[0],
      sanitized[1] ?? sanitized[0],
      sanitized[2] ?? sanitized[1] ?? sanitized[0],
    ];

    if (!placeholders[0]) {
      throw new Error("Unable to sanitize input images.");
    }

    const job = await prisma.thumbnailJob.create({
      data: {
        userId,
        status: "PENDING",
        aspectRatioId: aspectRatio.aspectRatioId,
        aspectRatioString: aspectRatio.aspectRatioString,
        customWidth: aspectRatio.customWidth,
        customHeight: aspectRatio.customHeight,
        inputImage1: placeholders[0] as Prisma.InputJsonValue,
        inputImage2: placeholders[1] as Prisma.InputJsonValue,
        inputImage3: placeholders[2] as Prisma.InputJsonValue,
        inputImagesMetadata: sanitized as Prisma.InputJsonValue,
        projectName: project.name,
        projectSlug: project.slug,
      },
    });
    jobId = job.id;

    await prisma.coverProject.update({
      where: { id: project.id },
      data: {
        libraryGenerationStatus: "GENERATING",
        libraryGenerationJobId: job.id,
        libraryGenerationQueuedAt: startedAt,
      },
    });

    await prisma.thumbnailJob.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });

    const falInput = buildFalWorkflowInput(uploadedInputs, aspectRatio.aspectRatioString);
    const falResult = await runFalWorkflow(falInput);
    const resultUrls = extractResultUrls(falResult.response);

    if (!resultUrls.length) {
      throw new Error("Fal workflow did not return any image URLs.");
    }

    const uploadedResults = await Promise.all(
      resultUrls.map((url) =>
        uploadGeneratedImageToCloudinary(url, {
          userId,
          jobId: job.id,
        }),
      ),
    );

    const primaryResult = uploadedResults[0];
    if (!primaryResult?.secureUrl) {
      throw new Error("Unable to upload generated cover images.");
    }

    const versionNumber = project.latestVersionNumber + 1;

    const sourceUrls = uploadedInputs.slice(0, 3).map((img) => img.uploadUrl ?? null);
    const allGeneratedUrls = uploadedResults.map((asset) => asset.secureUrl);

    await prisma.coverVersion.create({
      data: {
        projectId: project.id,
        thumbnailJobId: job.id,
        versionNumber,
        label: `${project.slug}_v${versionNumber}`,
        selectedImageUrl: primaryResult.secureUrl,
        generatedImageUrls: allGeneratedUrls as Prisma.InputJsonValue,
        sourceImage1Url: sourceUrls[0] ?? null,
        sourceImage2Url: sourceUrls[1] ?? null,
        sourceImage3Url: sourceUrls[2] ?? null,
      },
    });

    await prisma.coverProject.update({
      where: { id: project.id },
      data: {
        latestVersionNumber: versionNumber,
        libraryGenerationStatus: "COMPLETED",
        libraryGenerationCompletedAt: new Date(),
        libraryGenerationJobId: job.id,
      },
    });

    await prisma.thumbnailJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        falRequestId: falResult.requestId,
        falResultUrl: primaryResult.secureUrl,
        falResultUrls: uploadedResults.map((asset) => asset.secureUrl) as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error occurred.";
    if (jobId) {
      await prisma.thumbnailJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          errorMessage: message,
        },
      });
    }

    await prisma.coverProject.update({
      where: { id: project.id },
      data: {
        libraryGenerationStatus: "FAILED",
        libraryGenerationCompletedAt: new Date(),
        libraryGenerationJobId: jobId,
      },
    });

    throw error;
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let projectIds: string[] | undefined;
  const rawBody = await request.text();
  if (rawBody) {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "InvalidPayload", details: "Body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "InvalidPayload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    projectIds = parsed.data.projectIds;
  }

  if (!projectIds?.length) {
    return NextResponse.json(
      {
        error: "NothingSelected",
        details: "Select at least one project before starting generation.",
      },
      { status: 400 },
    );
  }

  const projects = await fetchProjects(session.user.id, projectIds);
  if (!projects.length) {
    return NextResponse.json(
      {
        error: "NothingSelected",
        details: "Selected projects are either missing or already processing.",
      },
      { status: 400 },
    );
  }

  const summary = {
    processed: 0,
    completed: 0,
    failed: 0,
  };
  const errors: { projectId: string; message: string }[] = [];

  for (const project of projects) {
    summary.processed += 1;
    try {
      await runGenerationForProject(project, session.user.id);
      summary.completed += 1;
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : "Unexpected error occurred.";
      errors.push({ projectId: project.id, message });
    }
  }

  return NextResponse.json(
    {
      success: true,
      summary,
      errors: errors.length ? errors : undefined,
    },
    { status: 200 },
  );
}


