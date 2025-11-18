import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  buildFalWorkflowInput,
  sanitizeImageMetadata,
  summarizeImagesForLogging,
} from "@/lib/generation";
import {
  ensureImagesHaveCloudinaryUrls,
  uploadGeneratedImageToCloudinary,
} from "@/lib/cloudinary";
import { persistGalleryUploads } from "@/lib/gallery";
import { FalExecutionResult, runFalWorkflow } from "@/lib/fal";
import { extractResultUrls } from "@/lib/fal-results";
import {
  CUSTOM_ASPECT_RATIO_ID,
  resolveAspectRatioString,
} from "@/lib/aspect-ratios";
import { prisma } from "@/lib/prisma";
import { logRequest } from "@/lib/request-logger";
import {
  CreateGenerationInput,
  createGenerationSchema,
} from "@/lib/validation/generate";
import { slugifyProjectName } from "@/lib/utils";

// Configure route to accept larger payloads
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for generation
export const dynamic = 'force-dynamic';

const MODEL_ID = process.env.FAL_WORKFLOW_PATH ?? "workflows/erdenizkorkmaz1/cover-generator";

function assertCustomDimensions(
  payload: CreateGenerationInput,
): asserts payload is CreateGenerationInput & {
  customWidth: number;
  customHeight: number;
} {
  if (payload.aspectRatioId !== CUSTOM_ASPECT_RATIO_ID) {
    return;
  }

  if (!payload.customWidth || !payload.customHeight) {
    throw new Error(
      "Custom width and height are required when using a custom aspect ratio.",
    );
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let responseStatus = 500;
  let falRequestId: string | undefined;
  let jobId: string | undefined;
  let userId: string | undefined;
  let payload: CreateGenerationInput | null = null;
  let uploadedImages: Awaited<
    ReturnType<typeof ensureImagesHaveCloudinaryUrls>
  > | null = null;

  const clonedRequest = request.clone();
  const rawBody = await clonedRequest.json().catch(() => null);
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.session || !session?.user) {
      responseStatus = 401;
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: responseStatus,
        },
      );
    }

    userId = session.user.id;
    console.log("rawBody", rawBody);
    const parsedPayload = createGenerationSchema.parse(rawBody);
    const normalizedProjectName = parsedPayload.projectName.trim();
    const projectSlug = slugifyProjectName(normalizedProjectName);
    payload = {
      ...parsedPayload,
      projectName: normalizedProjectName,
    };
    assertCustomDimensions(payload);

    uploadedImages = await ensureImagesHaveCloudinaryUrls(parsedPayload.images, {
      userId,
    });

    if (!uploadedImages || uploadedImages.length === 0) {
      throw new Error("Unable to upload images to Cloudinary.");
    }

    // Validate that all images have uploadUrl
    const missingUrls = uploadedImages.filter((img) => !img.uploadUrl);
    if (missingUrls.length > 0) {
      throw new Error(
        `${missingUrls.length} image(s) are missing uploadUrl after Cloudinary upload.`,
      );
    }

    // Pad images by duplicating the last image to reach 3 images for storage
    const paddedImages = [...uploadedImages];
    while (paddedImages.length < 3) {
      const lastImage = paddedImages[paddedImages.length - 1]!;
      paddedImages.push(lastImage);
    }

    const payloadWithUploads: CreateGenerationInput = {
      ...payload,
      images: uploadedImages as CreateGenerationInput["images"],
    };

    payload = payloadWithUploads;
    const hasCustomDimensions =
      typeof payloadWithUploads.customWidth === "number" &&
      typeof payloadWithUploads.customHeight === "number";
    const customDimensions = hasCustomDimensions
      ? {
          width: payloadWithUploads.customWidth!,
          height: payloadWithUploads.customHeight!,
        }
      : null;

    const aspectRatioString = resolveAspectRatioString(
      payloadWithUploads.aspectRatioId,
      customDimensions,
    );

    const falInput = buildFalWorkflowInput(uploadedImages, aspectRatioString);
    const sanitizedImages = paddedImages.map(sanitizeImageMetadata);
    const galleryUploads = uploadedImages.map((uploadedImage, index) => ({
      original: parsedPayload.images[index] ?? uploadedImage,
      uploaded: uploadedImage,
      metadata: sanitizedImages[index]!,
    }));

    const job = await prisma.thumbnailJob.create({
      data: {
        userId,
        status: "PENDING",
        aspectRatioId: payloadWithUploads.aspectRatioId,
        aspectRatioString,
        customWidth: payloadWithUploads.customWidth ?? null,
        customHeight: payloadWithUploads.customHeight ?? null,
        inputImage1: sanitizedImages[0]! as Prisma.InputJsonValue,
        inputImage2: sanitizedImages[1]! as Prisma.InputJsonValue,
        inputImage3: sanitizedImages[2]! as Prisma.InputJsonValue,
        inputImagesMetadata: sanitizedImages as Prisma.InputJsonValue,
        projectName: normalizedProjectName,
        projectSlug,
      },
    });

    jobId = job.id;

    await persistGalleryUploads(
      {
        userId,
        jobId: job.id,
        projectName: normalizedProjectName,
        projectSlug,
        aspectRatioId: payloadWithUploads.aspectRatioId,
        aspectRatioString,
      },
      galleryUploads,
    );

    await prisma.thumbnailJob.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });
    let falResult: FalExecutionResult | undefined;
    try {
      falResult = await runFalWorkflow(falInput);
      const falErrorBody =
        falResult && falResult.response && typeof falResult.response === "object"
          ? (falResult.response as { error?: { body?: unknown } }).error?.body
          : undefined;
      console.log("falResult ERROR", falErrorBody ?? "No error body");
    } catch (error) {
      console.error("[generate] failed to run Fal workflow", error);
      responseStatus = 502;
      return NextResponse.json(
        { error: "ImageGenerationFailed", details: error instanceof Error ? error.message : "Unexpected error occurred." },
        { status: responseStatus },
      );
    }
    falRequestId = falResult.requestId;

    const falWorkflowResultUrls = extractResultUrls(falResult.response);

    if (!falWorkflowResultUrls.length) {
      throw new Error("Fal workflow did not return any image URLs.");
    }

    if (!userId) {
      throw new Error("Missing user context for uploads.");
    }

    const authenticatedUserId = userId;
    const uploadedResults = await Promise.all(
      falWorkflowResultUrls.map((url) =>
        uploadGeneratedImageToCloudinary(url, {
          userId: authenticatedUserId,
          jobId,
        }),
      ),
    );

    const resultUrls = uploadedResults.map((asset) => asset.secureUrl);
    const primaryResultUrl = resultUrls[0]!;
    const updatedJob = await prisma.thumbnailJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCESS",
        falRequestId: falResult.requestId,
        falResultUrl: primaryResultUrl,
        falResultUrls: resultUrls,
        errorMessage: null,
      },
    });
    console.log("updatedJob", updatedJob);

    responseStatus = 200;
    return NextResponse.json(
      {
        job: {
          ...updatedJob,
          falResultUrls: resultUrls,
        },
        resultUrl: primaryResultUrl,
        resultUrls,
      },
      { status: responseStatus },
    );
  } catch (error) {
    console.error("[generate] failed", error);
    if (error instanceof ZodError) {
      responseStatus = 400;
      return NextResponse.json(
        {
          error: "ValidationError",
          details: error.flatten(),
        },
        { status: responseStatus },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unexpected error occurred.";

    if (jobId) {
      await prisma.thumbnailJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          errorMessage: message,
          falRequestId,
        },
      });
    }

    responseStatus = 502;
    return NextResponse.json(
      {
        error: "ImageGenerationFailed",
        details: message,
      },
      { status: responseStatus },
    );
  } finally {
    const latency = Date.now() - startedAt;
    try {
      const imagesForLogging = (
        uploadedImages ?? payload?.images ?? []
      ) as CreateGenerationInput["images"];

      await logRequest({
        userId,
        endpoint: "/api/generate",
        modelId: MODEL_ID,
        aspectRatioId: payload?.aspectRatioId ?? undefined,
        responseStatus,
        responseTimeMs: latency,
        falRequestId,
        inputImageCount: payload?.images.length ?? 0,
        requestPayloadSummary: {
          hasCustomDimensions: Boolean(
            payload &&
              payload.aspectRatioId === CUSTOM_ASPECT_RATIO_ID &&
              payload.customWidth &&
              payload.customHeight,
          ),
          images: payload ? summarizeImagesForLogging(imagesForLogging) : [],
        },
      });
    } catch (logError) {
      console.error("[generate] failed to log request", logError);
    }
  }
}

