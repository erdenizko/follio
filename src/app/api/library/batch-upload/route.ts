import { NextResponse } from "next/server";

import JSZip from "jszip";
import { randomUUID } from "node:crypto";

import { auth } from "@/lib/auth";
import { ensureImagesHaveCloudinaryUrls } from "@/lib/cloudinary";
import { persistGalleryUploads } from "@/lib/gallery";
import { sanitizeImageMetadata } from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import { slugifyProjectName } from "@/lib/utils";
import type { GenerationImageInput } from "@/lib/validation/generate";

// Configure route to accept larger payloads (200MB configured in vercel.json)
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large zip uploads
export const dynamic = 'force-dynamic';

const ZIP_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "multipart/x-zip",
] as const;
const ZIP_EXTENSIONS = [".zip"];
const ZIP_MIME_TYPES_LOWER = ZIP_MIME_TYPES.map((type) => type.toLowerCase());

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const EXTENSION_TO_MIME: Record<string, (typeof ACCEPTED_IMAGE_TYPES)[number]> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const MAX_IMAGES_PER_ARCHIVE = 60;
const MAX_IMAGES_PER_PROJECT = 3;

type ProjectGroup = {
  slug: string;
  name: string;
  inputs: GenerationImageInput[];
};

function isZipFile(file: File) {
  const normalizedType = file.type?.toLowerCase();
  if (normalizedType && ZIP_MIME_TYPES_LOWER.includes(normalizedType)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return ZIP_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function getFileExtension(fileName?: string | null) {
  if (!fileName) {
    return null;
  }
  const normalized = fileName.toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === normalized.length - 1) {
    return null;
  }
  return normalized.slice(lastDotIndex + 1);
}

function sanitizeFileName(entryName: string) {
  return entryName.split(/[/\\]/).filter(Boolean).join("-");
}

function resolveProjectSegment(segments: string[]) {
  if (!segments.length) {
    return null;
  }

  if (segments[0]?.toLowerCase() === "root") {
    return segments[1] ?? null;
  }

  return segments[0];
}

async function extractArchiveProjects(file: File) {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const groups = new Map<string, ProjectGroup>();

  const entries = Object.values(archive.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.name.toLowerCase().startsWith("__macosx/")) continue;

    const normalizedPath = entry.name.replace(/\\+/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);
    const projectSegment = resolveProjectSegment(segments);
    if (!projectSegment) continue;

    const projectName = projectSegment.trim();
    if (!projectName) continue;

    const slug = slugifyProjectName(projectName);
    if (!slug) continue;

    const fileSegments =
      segments[0]?.toLowerCase() === "root" ? segments.slice(2) : segments.slice(1);
    if (!fileSegments.length) continue;

    const relativeName = fileSegments.join("/");
    if (!relativeName || relativeName.startsWith("._")) continue;

    const extension = getFileExtension(relativeName);
    if (!extension) continue;

    const mimeType = EXTENSION_TO_MIME[extension];
    if (!mimeType) continue;
    if (!ACCEPTED_IMAGE_TYPES.includes(mimeType)) continue;

    const buffer = await entry.async("nodebuffer");
    if (!buffer.length) continue;

    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const input: GenerationImageInput = {
      id: randomUUID(),
      name: sanitizeFileName(relativeName),
      base64: dataUrl,
      mimeType,
      sizeBytes: buffer.length,
    };

    const existing = groups.get(slug);
    if (existing) {
      if (existing.inputs.length >= MAX_IMAGES_PER_PROJECT) {
        continue;
      }
      existing.inputs.push(input);
      continue;
    }

    groups.set(slug, {
      slug,
      name: projectName,
      inputs: [input],
    });
  }

  return groups;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "InvalidFormData", details: "Unable to parse form data." },
      { status: 400 },
    );
  }

  const zipCandidate = formData.get("file");
  if (!zipCandidate || !(zipCandidate instanceof File)) {
    return NextResponse.json(
      { error: "MissingFile", details: "Attach a ZIP archive named by project folders." },
      { status: 400 },
    );
  }

  if (!isZipFile(zipCandidate)) {
    return NextResponse.json(
      { error: "InvalidFileType", details: "Only ZIP archives are supported." },
      { status: 400 },
    );
  }

  const projectGroups = await extractArchiveProjects(zipCandidate);

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


