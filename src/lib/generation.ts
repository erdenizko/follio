import type {
  CloudinaryUploadMetadata,
  GenerationImageWithCloudinary,
} from "@/lib/cloudinary";
import type { GenerationImageInput } from "@/lib/validation/generate";

export type FalWorkflowInput = {
  image_url_1: string;
  image_url_2: string;
  image_url_3: string;
  aspect_ratio: string;
};

export type UrlImageSource = {
  type: "url";
  url: string;
  provider?: "cloudinary" | "external";
  cloudinaryPublicId?: string;
};

export type SanitizedImageMetadata = {
  id: string;
  name: string;
  mimeType: GenerationImageInput["mimeType"];
  sizeBytes: number;
  width?: number;
  height?: number;
  source:
    | UrlImageSource
    | {
        type: "base64";
        preview: string;
        length: number;
      };
};

function resolveImageSource(image: GenerationImageInput) {
  if (image.uploadUrl) {
    return image.uploadUrl;
  }

  if (image.base64) {
    return image.base64;
  }

  throw new Error(`Image "${image.name}" does not have a valid source.`);
}

export function buildFalWorkflowInput(
  images: GenerationImageInput[],
  aspectRatio: string,
): FalWorkflowInput {
  return {
    image_url_1: resolveImageSource(images[0]),
    image_url_2: resolveImageSource(images[1]),
    image_url_3: resolveImageSource(images[2]),
    aspect_ratio: aspectRatio,
  };
}

function resolveProvider(cloudinary?: CloudinaryUploadMetadata): UrlImageSource["provider"] {
  if (cloudinary) {
    return "cloudinary";
  }

  return undefined;
}

export function sanitizeImageMetadata(
  image: GenerationImageWithCloudinary,
): SanitizedImageMetadata {
  const base = {
    id: image.id,
    name: image.name,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    width: image.width,
    height: image.height,
  };

  if (image.uploadUrl) {
    return {
      ...base,
      source: {
        type: "url",
        url: image.uploadUrl,
        provider: resolveProvider(image.cloudinary),
        cloudinaryPublicId: image.cloudinary?.publicId,
      },
    };
  }

  const preview = image.base64?.slice(0, 40) ?? "";

  return {
    ...base,
    source: {
      type: "base64",
      preview,
      length: image.base64?.length ?? 0,
    },
  };
}

export function summarizeImagesForLogging(images: GenerationImageInput[]) {
  return images.map((image) => {
    const cloudinary = (image as GenerationImageInput & {
      cloudinary?: CloudinaryUploadMetadata;
    }).cloudinary;

    return {
      id: image.id,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      hasUrl: Boolean(image.uploadUrl),
      hasBase64: Boolean(image.base64),
      cloudinaryPublicId: cloudinary?.publicId,
    };
  });
}

