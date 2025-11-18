import { NextResponse } from "next/server";

import JSZip from "jszip";
import { randomUUID } from "node:crypto";

import { ensureImagesHaveCloudinaryUrls } from "@/lib/cloudinary";
import { auth } from "@/lib/auth";
import { persistGalleryUploads } from "@/lib/gallery";
import { sanitizeImageMetadata } from "@/lib/generation";
import type { GenerationImageInput } from "@/lib/validation/generate";

// Configure route to accept larger payloads (200MB for zip files)
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large zip uploads
export const dynamic = 'force-dynamic';

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const ZIP_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "multipart/x-zip",
] as const;
const ZIP_EXTENSIONS = [".zip"];
const ZIP_MIME_TYPES_LOWER = ZIP_MIME_TYPES.map((type) => type.toLowerCase());
const EXTENSION_TO_MIME: Record<string, (typeof ACCEPTED_IMAGE_TYPES)[number]> =
  {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
const MAX_IMAGES_PER_BATCH = 60;

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

function sanitizeZipEntryName(entryName: string) {
  const segments = entryName.split(/[/\\]/).filter(Boolean);
  if (segments.length) {
    return segments[segments.length - 1]!;
  }
  const fallback = entryName.replace(/[/\\]/g, "-");
  return fallback || `image-${Date.now()}`;
}

async function fileToGenerationInput(file: File): Promise<GenerationImageInput> {
  const extension = getFileExtension(file.name);
  const mimeType =
    (file.type as GenerationImageInput["mimeType"]) ||
    (extension ? EXTENSION_TO_MIME[extension] : null);

  if (!mimeType || !ACCEPTED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported file type for ${file.name}.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    id: randomUUID(),
    name: file.name,
    base64: dataUrl,
    mimeType,
    sizeBytes: buffer.length,
  };
}

async function extractZipEntries(file: File): Promise<GenerationImageInput[]> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const extracted: GenerationImageInput[] = [];

  const entries = Object.values(archive.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const lowerName = entry.name.toLowerCase();
    if (lowerName.startsWith("__macosx/")) continue;

    const sanitizedName = sanitizeZipEntryName(entry.name);
    if (sanitizedName.startsWith("._")) continue;

    const extension = getFileExtension(entry.name);
    if (!extension) continue;

    const mimeType = EXTENSION_TO_MIME[extension];
    if (!mimeType) continue;

    const buffer = await entry.async("nodebuffer");
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

    extracted.push({
      id: randomUUID(),
      name: sanitizedName,
      base64: dataUrl,
      mimeType,
      sizeBytes: buffer.length,
    });
  }

  return extracted;
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

  const entries = formData.getAll("files").filter((item): item is File => {
    return typeof File !== "undefined" && item instanceof File;
  });

  if (!entries.length) {
    return NextResponse.json(
      { error: "MissingFiles", details: "Select at least one file to upload." },
      { status: 400 },
    );
  }

  const zipEntries = entries.filter(isZipFile);
  if (zipEntries.length > 1) {
    return NextResponse.json(
      { error: "TooManyZips", details: "Upload one ZIP archive at a time." },
      { status: 400 },
    );
  }

  if (zipEntries.length === 1 && entries.length > 1) {
    return NextResponse.json(
      {
        error: "ZipConflict",
        details: "ZIP uploads cannot be mixed with other files.",
      },
      { status: 400 },
    );
  }

  const generationInputs: GenerationImageInput[] = [];

  for (const file of entries) {
    if (isZipFile(file)) {
      const extracted = await extractZipEntries(file);
      generationInputs.push(...extracted);
    } else {
      const input = await fileToGenerationInput(file);
      generationInputs.push(input);
    }
  }

  if (!generationInputs.length) {
    return NextResponse.json(
      {
        error: "NoImages",
        details: "No supported images were found in your selection.",
      },
      { status: 400 },
    );
  }

  if (generationInputs.length > MAX_IMAGES_PER_BATCH) {
    return NextResponse.json(
      {
        error: "TooManyImages",
        details: `Upload up to ${MAX_IMAGES_PER_BATCH} images at a time.`,
      },
      { status: 400 },
    );
  }

  try {
    const uploadedImages = await ensureImagesHaveCloudinaryUrls(
      generationInputs,
      {
        userId: session.user.id,
      },
    );

    const sanitized = uploadedImages.map(sanitizeImageMetadata);

    await persistGalleryUploads(
      {
        userId: session.user.id,
        projectName: null,
        projectSlug: null,
      },
      uploadedImages.map((uploaded, index) => ({
        original: generationInputs[index]!,
        uploaded,
        metadata: sanitized[index]!,
      })),
    );

    return NextResponse.json(
      {
        success: true,
        count: sanitized.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[gallery/upload] failed", error);
    return NextResponse.json(
      {
        error: "BatchUploadFailed",
        details:
          error instanceof Error ? error.message : "Unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}

