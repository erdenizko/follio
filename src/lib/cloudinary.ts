import { v2 as cloudinary } from "cloudinary";

import type { GenerationImageInput } from "@/lib/validation/generate";

const DEFAULT_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER ?? "cover-generator";

type ConfigureOptions =
  | {
      useExplicitUrl: true;
    }
  | {
      useExplicitUrl: false;
      cloudName: string;
      apiKey: string;
      apiSecret: string;
    };

let isConfigured = false;

function resolveConfiguration(): ConfigureOptions {
  if (process.env.CLOUDINARY_URL) {
    return { useExplicitUrl: true };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary configuration. Provide CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }

  return {
    useExplicitUrl: false,
    cloudName,
    apiKey,
    apiSecret,
  };
}

function ensureCloudinaryConfigured() {
  if (isConfigured) return;

  const config = resolveConfiguration();

  if (config.useExplicitUrl) {
    cloudinary.config({ secure: true });
    isConfigured = true;
    return;
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  isConfigured = true;
}

export type CloudinaryUploadMetadata = {
  provider: "cloudinary";
  publicId: string;
  assetId?: string;
  version?: number;
  folder?: string;
};

type UploadContext = {
  userId: string;
  jobId?: string;
  folder?: string;
};

export type GenerationImageWithCloudinary = GenerationImageInput & {
  cloudinary?: CloudinaryUploadMetadata;
};

function resolveFolderPath({ folder, userId }: UploadContext) {
  if (folder) return folder;
  return `${DEFAULT_FOLDER}/${userId}`;
}

export type CloudinaryUploadedAsset = {
  url: string;
  secureUrl: string;
  publicId: string;
  folder: string;
  bytes?: number;
  width?: number;
  height?: number;
};

export async function ensureImagesHaveCloudinaryUrls(
  images: GenerationImageInput[],
  context: UploadContext,
): Promise<GenerationImageWithCloudinary[]> {
  ensureCloudinaryConfigured();

  const folder = resolveFolderPath(context);

  return Promise.all(
    images.map(async (image) => {
      if (image.uploadUrl) {
        return {
          ...image,
          base64: undefined,
        };
      }

      if (!image.base64) {
        throw new Error(
          `Image "${image.name}" is missing both an uploadUrl and base64 payload.`,
        );
      }

      const uploadResult = await cloudinary.uploader.upload(image.base64, {
        folder,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        context: {
          user_id: context.userId,
          job_id: context.jobId ?? "pending",
          image_id: image.id,
        },
      });

      const uploadUrl = uploadResult.secure_url ?? uploadResult.url;
      
      if (!uploadUrl) {
        throw new Error(
          `Cloudinary upload succeeded but returned no URL for image "${image.name}".`,
        );
      }

      return {
        ...image,
        uploadUrl,
        base64: undefined,
        sizeBytes: uploadResult.bytes ?? image.sizeBytes,
        width: image.width ?? uploadResult.width ?? undefined,
        height: image.height ?? uploadResult.height ?? undefined,
        mimeType: image.mimeType ?? `image/${uploadResult.format}`,
        cloudinary: {
          provider: "cloudinary",
          publicId: uploadResult.public_id,
          assetId: uploadResult.asset_id ?? undefined,
          version: uploadResult.version ?? undefined,
          folder,
        },
      };
    }),
  );
}

export async function uploadGeneratedImageToCloudinary(
  url: string,
  context: UploadContext,
): Promise<CloudinaryUploadedAsset> {
  ensureCloudinaryConfigured();

  if (!url) {
    throw new Error("A valid image URL is required to upload to Cloudinary.");
  }

  const baseFolder = resolveFolderPath(context);
  const folder = `${baseFolder}/results`;

  const uploadResult = await cloudinary.uploader.upload(url, {
    folder,
    resource_type: "image",
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    context: {
      user_id: context.userId,
      job_id: context.jobId ?? "pending",
      source: "fal_generated_output",
    },
  });

  return {
    url: uploadResult.url,
    secureUrl: uploadResult.secure_url ?? uploadResult.url,
    publicId: uploadResult.public_id,
    folder,
    bytes: uploadResult.bytes ?? undefined,
    width: uploadResult.width ?? undefined,
    height: uploadResult.height ?? undefined,
  };
}

