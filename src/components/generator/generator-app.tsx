"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUpRight,
  Download,
  History,
  Loader2,
  Play,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ASPECT_RATIO_PRESETS,
  CUSTOM_ASPECT_RATIO_ID,
  DEFAULT_ASPECT_RATIO_ID,
} from "@/lib/aspect-ratios";

type JobStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";

type SanitizedImageMetadata = {
  id: string;
  name: string;
  order: number;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  source:
  | {
    type: "url";
    url: string;
    provider?: "cloudinary" | "external";
    cloudinaryPublicId?: string;
  }
  | { type: "base64"; preview: string; length: number };
};

export type SerializedThumbnailJob = {
  id: string;
  status: JobStatus;
  aspectRatioId: string;
  aspectRatioString: string;
  customWidth: number | null;
  customHeight: number | null;
  falResultUrl: string | null;
  falResultUrls?: string[] | null;
  falRequestId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  inputImagesMetadata: SanitizedImageMetadata[];
  projectName: string | null;
  projectSlug: string | null;
};

export type SerializedCoverVersion = {
  id: string;
  versionNumber: number;
  label: string;
  selectedImageUrl: string;
  createdAt: string;
  thumbnailJob: SerializedThumbnailJob | null;
};

export type SerializedCoverProject = {
  id: string;
  name: string;
  slug: string;
  latestVersionNumber: number;
  versions: SerializedCoverVersion[];
};

export type GeneratorAppProps = {
  initialJobs: SerializedThumbnailJob[];
  initialProject?: SerializedCoverProject | null;
  initialVersionId?: string | null;
};

function resolveJobPreviewUrls(job?: SerializedThumbnailJob | null) {
  if (!job) {
    return [];
  }

  const urls: string[] = [];

  if (Array.isArray(job.falResultUrls)) {
    for (const candidate of job.falResultUrls) {
      if (typeof candidate === "string" && candidate.trim()) {
        urls.push(candidate.trim());
      }
    }
  }

  if (typeof job.falResultUrl === "string" && job.falResultUrl.trim()) {
    urls.push(job.falResultUrl.trim());
  }

  return Array.from(new Set(urls));
}

type UploadedImage = {
  id: string;
  name: string;
  base64?: string;
  previewUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  uploadUrl?: string;
  galleryImageId?: string;
  checksum?: string | null;
};

type GenerationPayload = {
  projectName: string;
  aspectRatioId: string;
  customWidth: number | null;
  customHeight: number | null;
  images: Array<{
    id: string;
    name: string;
    base64?: string;
    uploadUrl?: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
  }>;
};

const GALLERY_UPLOAD_ID_PREFIX = "gallery:";

type GalleryImageSummary = {
  id: string;
  projectName: string | null;
  projectSlug: string | null;
  uploadUrl: string;
  checksum: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  aspectRatioString: string | null;
  createdAt: string;
};

type GalleryApiResponse = {
  images?: GalleryImageSummary[];
};

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const ZIP_MIME_TYPES = ["application/zip", "application/x-zip-compressed", "application/x-zip", "multipart/x-zip"];
const ZIP_MIME_TYPES_LOWER = ZIP_MIME_TYPES.map((type) => type.toLowerCase());
const ZIP_FILE_EXTENSIONS = [".zip"];
const FILE_INPUT_ACCEPT = [...ACCEPTED_IMAGE_TYPES, ...ZIP_MIME_TYPES, ...ZIP_FILE_EXTENSIONS].join(",");
const MAX_FILE_SIZE = 10 * 1024 * 1024;
type AcceptedImageMimeType = (typeof ACCEPTED_IMAGE_TYPES)[number];
const EXTENSION_TO_MIME: Record<string, AcceptedImageMimeType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const generatorFormSchema = z.object({
  projectName: z
    .string()
    .min(3, "Give this creation a name.")
    .max(80, "Names must be 80 characters or less.")
    .transform((value) => value.trim()),
  aspectRatioId: z.string().min(1),
  customWidth: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
  customHeight: z
    .union([z.coerce.number().int().positive(), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
});

type GeneratorFormValues = z.infer<typeof generatorFormSchema>;

export function GeneratorApp({
  initialJobs,
  initialProject = null,
  initialVersionId = null,
}: GeneratorAppProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const projectIdFromSearchParams = searchParams.get("projectId");
  const previousProjectIdRef = useRef<string | null>(
    projectIdFromSearchParams,
  );

  const initialSelectedVersion = useMemo(() => {
    if (!initialProject) return null;
    if (initialVersionId) {
      return (
        initialProject.versions.find(
          (version) => version.id === initialVersionId,
        ) ?? null
      );
    }
    return initialProject.versions[0] ?? null;
  }, [initialProject, initialVersionId]);

  const defaultJob = initialSelectedVersion?.thumbnailJob ?? initialJobs[0] ?? null;

  const defaultFormValues = useMemo<GeneratorFormValues>(
    () => ({
      projectName:
        initialProject?.name ??
        "",
      aspectRatioId:
        initialSelectedVersion?.thumbnailJob?.aspectRatioId ??
        DEFAULT_ASPECT_RATIO_ID,
      customWidth: initialSelectedVersion?.thumbnailJob?.customWidth ?? undefined,
      customHeight: initialSelectedVersion?.thumbnailJob?.customHeight ?? undefined,
    }),
    [initialProject, initialSelectedVersion],
  );

  const [project, setProject] = useState<SerializedCoverProject | null>(
    initialProject ?? null,
  );
  const [images, setImages] = useState<UploadedImage[]>(() =>
    initialSelectedVersion?.thumbnailJob
      ? buildUploadedImagesFromMetadata(
        initialSelectedVersion.thumbnailJob.inputImagesMetadata,
      )
      : [],
  );
  const [activeJob, setActiveJob] = useState<SerializedThumbnailJob | null>(
    () => defaultJob,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    initialSelectedVersion?.id ?? null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [canCreateNewCover, setCanCreateNewCover] = useState(false);
  const [isGalleryDialogOpen, setIsGalleryDialogOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImageSummary[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<string[]>([]);
  const [isImportingFromGallery, setIsImportingFromGallery] = useState(false);

  const form = useForm<GeneratorFormValues>({
    resolver: zodResolver(generatorFormSchema),
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current;
    if (!projectIdFromSearchParams && previousProjectId) {
      const currentValues = form.getValues();

      form.reset({
        projectName: "",
        aspectRatioId: currentValues.aspectRatioId,
        customWidth: currentValues.customWidth,
        customHeight: currentValues.customHeight,
      });
      setProject(null);
      setImages([]);
      setActiveJob(null);
      setSelectedVersionId(null);
      setGenerationError(null);
      setCanCreateNewCover(false);
    }

    previousProjectIdRef.current = projectIdFromSearchParams;
  }, [form, projectIdFromSearchParams]);

  useEffect(() => {
    setProject(initialProject ?? null);
  }, [initialProject]);

  useEffect(() => {
    if (!initialSelectedVersion?.thumbnailJob) {
      return;
    }

    setImages(
      buildUploadedImagesFromMetadata(
        initialSelectedVersion.thumbnailJob.inputImagesMetadata,
      ),
    );
    setActiveJob(initialSelectedVersion.thumbnailJob);
    setSelectedVersionId(initialSelectedVersion.id);
    form.reset({
      projectName:
        initialSelectedVersion.thumbnailJob.projectName ??
        initialProject?.name ??
        "",
      aspectRatioId: initialSelectedVersion.thumbnailJob.aspectRatioId,
      customWidth: initialSelectedVersion.thumbnailJob.customWidth ?? undefined,
      customHeight: initialSelectedVersion.thumbnailJob.customHeight ?? undefined,
    });
  }, [form, initialProject, initialSelectedVersion]);

  const aspectRatioId = form.watch("aspectRatioId");
  const projectNameValue = form.watch("projectName");
  const isCustomAspectRatio = aspectRatioId === CUSTOM_ASPECT_RATIO_ID;
  const availablePreviewUrls = resolveJobPreviewUrls(activeJob);
  const canSaveSelection = Boolean(
    projectNameValue?.trim() && availablePreviewUrls.length,
  );
  const existingGalleryImageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const image of images) {
      if (image.galleryImageId) {
        ids.add(image.galleryImageId);
        continue;
      }
      if (image.id.startsWith(GALLERY_UPLOAD_ID_PREFIX)) {
        ids.add(image.id.slice(GALLERY_UPLOAD_ID_PREFIX.length));
      }
    }
    return ids;
  }, [images]);
  const gallerySelectionCount = selectedGalleryIds.length;

  const processImageFile = useCallback(
    async (file: File): Promise<UploadedImage | null> => {
      const mimeType = getMimeTypeForFile(file);
      if (!mimeType) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} is not a supported image format.`,
          variant: "destructive",
        });
        return null;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 10MB size limit.`,
          variant: "destructive",
        });
        return null;
      }

      const base64 = await readFileAsDataUrl(file);
      const { width, height } = await readImageDimensions(base64).catch(() => ({
        width: undefined,
        height: undefined,
      }));

      return {
        id: crypto.randomUUID(),
        name: file.name,
        base64,
        previewUrl: base64,
        mimeType,
        sizeBytes: file.size,
        width,
        height,
      };
    },
    [toast],
  );

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;

      const newImages: UploadedImage[] = [];

      for (const file of Array.from(fileList)) {
        if (isZipFile(file)) {
          try {
            const extractedFiles = await extractImageFilesFromZip(file);
            if (!extractedFiles.length) {
              toast({
                title: "No images found",
                description: `${file.name} does not contain PNG, JPG, or WEBP files.`,
                variant: "destructive",
              });
              continue;
            }

            for (const extractedFile of extractedFiles) {
              const image = await processImageFile(extractedFile);
              if (image) {
                newImages.push(image);
              }
            }
          } catch (error) {
            console.error("Failed to extract zip", error);
            toast({
              title: "Zip error",
              description: `We couldn't read ${file.name}.`,
              variant: "destructive",
            });
          }
          continue;
        }

        const image = await processImageFile(file);
        if (image) {
          newImages.push(image);
        }
      }

      if (!newImages.length) {
        return;
      }

      setImages((prev) => [...prev, ...newImages]);
    },
    [processImageFile, toast],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      void addFiles(files);
    },
    [addFiles],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      void addFiles(files);
      event.target.value = "";
    },
    [addFiles],
  );

  const deleteImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id));
  }, []);

  const handleGenerate = useCallback(
    async (values: GeneratorFormValues) => {
      if (!images.length) {
        toast({
          title: "Upload first",
          description: "Add at least one layer before generating.",
          variant: "destructive",
        });
        return;
      }

      const normalizedProjectName = values.projectName.trim();
      if (!normalizedProjectName) {
        toast({
          title: "Name required",
          description: "Give this creation a name before generating.",
          variant: "destructive",
        });
        return;
      }

      const customWidth =
        values.aspectRatioId === CUSTOM_ASPECT_RATIO_ID
          ? Number(values.customWidth ?? 0)
          : null;
      const customHeight =
        values.aspectRatioId === CUSTOM_ASPECT_RATIO_ID
          ? Number(values.customHeight ?? 0)
          : null;

      if (
        values.aspectRatioId === CUSTOM_ASPECT_RATIO_ID &&
        (!customWidth || !customHeight)
      ) {
        toast({
          title: "Need both numbers",
          description: "Width and height are required for custom ratios.",
          variant: "destructive",
        });
        return;
      }

      const payloadImages = images
        .map((image) => ({
          id: image.id,
          name: image.name,
          base64: image.base64,
          uploadUrl: image.uploadUrl,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          width: image.width,
          height: image.height,
        }))
        .filter((image) => image.base64 || image.uploadUrl);

      if (!payloadImages.length) {
        toast({
          title: "Images unavailable",
          description: "We couldn't load the layers for this generation.",
          variant: "destructive",
        });
        return;
      }

      const payload: GenerationPayload = {
        projectName: normalizedProjectName,
        aspectRatioId: values.aspectRatioId,
        customWidth,
        customHeight,
        images: payloadImages,
      };

      setIsGenerating(true);
      setCanCreateNewCover(false);
      setGenerationError(null);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const message =
            error?.details?.message ??
            error?.details ??
            error?.error ??
            "Failed to generate image.";
          setGenerationError(message);
          toast({
            title: "Generation failed",
            description: message,
            variant: "destructive",
          });
          return;
        }

        const data = await response.json();
        const job: SerializedThumbnailJob = data.job;
        setActiveJob(job);
        setSelectedVersionId(null);

        toast({
          title: "Cover ready",
          description: "Preview updated.",
        });
      } catch (error) {
        console.error(error);
        setGenerationError("Unexpected error while generating the cover.");
        toast({
          title: "Unexpected error",
          description: "We could not reach the generation service.",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [images, toast],
  );

  const handleReset = useCallback(() => {
    setImages([]);
    setGenerationError(null);
    setActiveJob(defaultJob);
    setSelectedVersionId(initialSelectedVersion?.id ?? null);
    setCanCreateNewCover(false);
    form.reset({
      projectName: project?.name ?? "",
      aspectRatioId: DEFAULT_ASPECT_RATIO_ID,
      customWidth: undefined,
      customHeight: undefined,
    });
  }, [defaultJob, form, initialSelectedVersion, project]);

  const handleSaveSelection = useCallback(
    async (selectedImageUrl?: string) => {
      const targetUrl = selectedImageUrl ?? availablePreviewUrls[0];
      if (!activeJob?.id || !targetUrl) {
        toast({
          title: "Generate first",
          description: "Create a cover and preview it before saving.",
          variant: "destructive",
        });
        return;
      }

      setIsSavingSelection(true);
      try {
        const response = await fetch("/api/library/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jobId: activeJob.id,
            selectedImageUrl: targetUrl,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const message =
            error?.details?.message ??
            error?.details ??
            error?.error ??
            "Unable to save this cover.";
          toast({
            title: "Save failed",
            description: message,
            variant: "destructive",
          });
          return;
        }

        const data = await response.json();
        const nextVersion: SerializedCoverVersion = {
          id: data.version.id,
          versionNumber: data.version.versionNumber,
          label: data.version.label,
          selectedImageUrl: data.version.selectedImageUrl,
          createdAt: data.version.createdAt,
          thumbnailJob: activeJob,
        };

        setProject((prev) => {
          if (!prev || prev.id !== data.project.id) {
            return {
              id: data.project.id,
              name: data.project.name,
              slug: data.project.slug,
              latestVersionNumber: data.project.latestVersionNumber,
              versions: [nextVersion],
            };
          }

          if (prev.versions.some((entry) => entry.id === nextVersion.id)) {
            return prev;
          }

          return {
            ...prev,
            name: data.project.name,
            latestVersionNumber: data.project.latestVersionNumber,
            versions: [nextVersion, ...prev.versions],
          };
        });

        setSelectedVersionId(nextVersion.id);
        const savedImageIndex = availablePreviewUrls.findIndex(
          (candidate) => candidate === targetUrl,
        );
        await triggerImageDownload(
          targetUrl,
          getDownloadFileName(
            activeJob,
            savedImageIndex >= 0 ? savedImageIndex : undefined,
          ),
        );
        setCanCreateNewCover(true);
        toast({
          title: "Saved to library",
          description: `${nextVersion.label} is now in your history.`,
        });
        router.refresh();
      } catch (error) {
        console.error(error);
        toast({
          title: "Unexpected error",
          description: "We could not save this cover to your library.",
          variant: "destructive",
        });
      } finally {
        setIsSavingSelection(false);
      }
    },
    [activeJob, availablePreviewUrls, router, toast],
  );

  const handleSelectVersionFromHistory = useCallback(
    (versionId: string) => {
      if (!project) return;
      const version = project.versions.find((entry) => entry.id === versionId);
      if (!version?.thumbnailJob) return;

      setSelectedVersionId(version.id);
      setCanCreateNewCover(false);
      setImages(
        buildUploadedImagesFromMetadata(
          version.thumbnailJob.inputImagesMetadata,
        ),
      );
      setActiveJob(version.thumbnailJob);
      form.reset({
        projectName: project.name,
        aspectRatioId: version.thumbnailJob.aspectRatioId,
        customWidth: version.thumbnailJob.customWidth ?? undefined,
        customHeight: version.thumbnailJob.customHeight ?? undefined,
      });
    },
    [form, project],
  );

  const handleCreateNew = useCallback(() => {
    setCanCreateNewCover(false);
    router.push("/");
  }, [router]);

  const loadGalleryImages = useCallback(async () => {
    if (isGalleryLoading) {
      return;
    }
    setIsGalleryLoading(true);
    setGalleryError(null);
    try {
      const response = await fetch("/api/gallery");
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const message =
          error?.error ??
          error?.details ??
          "Unable to load gallery images.";
        throw new Error(message);
      }
      const data = (await response.json()) as GalleryApiResponse;
      const normalized = Array.isArray(data.images) ? data.images : [];
      setGalleryImages(normalized);
    } catch (error) {
      console.error("[generator] failed to load gallery images", error);
      setGalleryError("Unable to load your gallery right now.");
      toast({
        title: "Gallery unavailable",
        description: "We couldn't load your saved uploads. Try again shortly.",
        variant: "destructive",
      });
    } finally {
      setIsGalleryLoading(false);
    }
  }, [isGalleryLoading, toast]);

  const handleOpenGalleryDialog = useCallback(() => {
    setIsGalleryDialogOpen(true);
    if (!galleryImages.length) {
      void loadGalleryImages();
    }
  }, [galleryImages.length, loadGalleryImages]);

  const handleCloseGalleryDialog = useCallback(() => {
    setIsGalleryDialogOpen(false);
    setSelectedGalleryIds([]);
  }, []);

  const handleRetryGalleryFetch = useCallback(() => {
    void loadGalleryImages();
  }, [loadGalleryImages]);

  const toggleGallerySelection = useCallback(
    (galleryId: string) => {
      if (existingGalleryImageIds.has(galleryId)) {
        return;
      }
      setSelectedGalleryIds((previous) =>
        previous.includes(galleryId)
          ? previous.filter((id) => id !== galleryId)
          : [...previous, galleryId],
      );
    },
    [existingGalleryImageIds],
  );

  const handleImportSelectedFromGallery = useCallback(async () => {
    if (!selectedGalleryIds.length) {
      return;
    }
    setIsImportingFromGallery(true);
    try {
      const importable = galleryImages.filter(
        (image) =>
          selectedGalleryIds.includes(image.id) &&
          !existingGalleryImageIds.has(image.id),
      );
      if (!importable.length) {
        toast({
          title: "Nothing to add",
          description: "Those images are already in your upload list.",
        });
        return;
      }
      const mappedUploads = importable.map((image) =>
        buildUploadedImageFromGallery(image),
      );
      setImages((prev) => [...prev, ...mappedUploads]);
      toast({
        title: "Images added",
        description: `Added ${mappedUploads.length} ${mappedUploads.length === 1 ? "image" : "images"
          } from your gallery.`,
      });
      setSelectedGalleryIds([]);
      setIsGalleryDialogOpen(false);
    } catch (error) {
      console.error("[generator] failed to import gallery images", error);
      toast({
        title: "Failed to add images",
        description: "We couldn't add those gallery images. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsImportingFromGallery(false);
    }
  }, [
    existingGalleryImageIds,
    galleryImages,
    selectedGalleryIds,
    toast,
  ]);

  useEffect(() => {
    setSelectedGalleryIds((previous) =>
      previous.filter((id) => !existingGalleryImageIds.has(id)),
    );
  }, [existingGalleryImageIds]);

  useEffect(() => {
    if (!isGalleryDialogOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseGalleryDialog();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseGalleryDialog, isGalleryDialogOpen]);

  return (
    <div className="flex flex-col gap-6 md:gap-10">
      <Form {...form}>
        <form
          className="relative flex flex-col gap-4 md:gap-8"
          onSubmit={form.handleSubmit((values) => void handleGenerate(values))}
        >
          <div className="w-full grid gap-6 lg:gap-12 lg:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.8fr)] lg:items-center ">
            <div className="rounded-[20px] md:rounded-[32px] border border-white/15 bg-black/30 p-4 md:p-6 backdrop-blur z-10">
              <div className="w-full flex flex-row gap-4 md:gap-8">
                <FormField
                  control={form.control}
                  name="projectName"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel className="text-xs uppercase text-white/60">
                        Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="Merry Christmas"
                          className="w-full border border-white/15 bg-black/30 p-4 md:p-6 text-base text-white placeholder:text-white/30"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="relative">
                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  htmlFor="file-upload"
                  className="flex w-full min-h-96 cursor-pointer flex-col items-center justify-center rounded-[20px] md:rounded-[28px] bg-black/40 text-center transition hover:border-white/60"
                >
                  <UploadCloud className="h-10 w-10 md:h-12 md:w-12 text-white" />
                  <p className="mt-3 md:mt-4 text-xs md:text-sm uppercase tracking-[0.3em] md:tracking-[0.4em] text-white/60">Drop art</p>
                  <p className="text-[10px] md:text-xs text-white/40 px-2">PNG · JPG · WEBP · ZIP · 10MB ea</p>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept={FILE_INPUT_ACCEPT}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              <div className="mt-3 md:mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs md:text-sm text-white/80 hover:text-white"
                  onClick={handleOpenGalleryDialog}
                >
                  Select from gallery
                </Button>
              </div>
              {images.length ? (
                <div className="mt-3 md:mt-4 flex flex-col items-end gap-2">
                  <div className="grid grid-cols-3 gap-2 md:gap-3 w-full">
                    {images.map((image) => (
                      <div
                        key={image.id}
                        className="group relative aspect-square overflow-hidden rounded-xl md:rounded-2xl border border-white/10"
                      >
                        <NextImage src={image.previewUrl} alt={image.name} fill className="object-cover" />
                        <button
                          type="button"
                          onClick={() => deleteImage(image.id)}
                          className="absolute right-1.5 top-1.5 md:right-2 md:top-2 rounded-full bg-black/70 p-1 md:p-1.5 text-white opacity-100 md:opacity-0 transition md:group-hover:opacity-100"
                          aria-label={`Remove ${image.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="text-xs md:text-sm" onClick={handleReset}>
                    Clear uploads
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-3 md:gap-4 mt-3 md:mt-4">
                <FormField
                  control={form.control}
                  name="aspectRatioId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase text-white/60">
                        Ratio
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 md:h-12 rounded-xl md:rounded-2xl border-white/20 bg-black/60 text-slate-100">
                            <SelectValue placeholder="Preset" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ASPECT_RATIO_PRESETS.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.label}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_ASPECT_RATIO_ID}>Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isCustomAspectRatio ? (
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    <FormField
                      control={form.control}
                      name="customWidth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] md:text-[11px] uppercase text-white/50">
                            Width
                          </FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              placeholder="1080"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              className="h-11 md:h-12 rounded-xl md:rounded-2xl border-white/20 bg-black/60 text-slate-100 placeholder:text-white/30"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customHeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] md:text-[11px] uppercase text-white/50">
                            Height
                          </FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              placeholder="1920"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              className="h-11 md:h-12 rounded-xl md:rounded-2xl border-white/20 bg-black/60 text-slate-100 placeholder:text-white/30"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <hr className="border-white/15 border-2 border-dotted absolute top-1/2 -translate-y-1/2 w-full hidden lg:block" />

            <div className="flex items-center justify-center lg:-mt-2 mb-4 lg:mb-0">
              <Button
                type="submit"
                className="flex w-full md:w-20 md:h-20 items-center justify-center rounded-full bg-white text-black shadow-2xl transition hover:scale-105 disabled:opacity-60"
                disabled={isGenerating}
              >
                <span className="block md:sr-only">Create cover</span>
                {isGenerating ? (
                  <Loader2 className="!size-6 md:!size-8 animate-spin" />
                ) : (
                  <Play className="!size-6 md:!size-8" />
                )}
              </Button>
            </div>

            <div className="flex w-full h-full flex-col gap-4 md:gap-6 rounded-[20px] md:rounded-[32px] border border-white/15 bg-black/30 p-4 md:p-6 backdrop-blur">
              {generationError ? (
                <p className="rounded-xl md:rounded-2xl border border-red-500/30 bg-red-500/10 px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-red-200">
                  {generationError}
                </p>
              ) : null}

              <PreviewPanel
                key={activeJob ? `${activeJob.id}-${activeJob.updatedAt}` : "empty-preview"}
                isLoading={isGenerating}
                job={activeJob}
                onSelect={(url) => {
                  void handleSaveSelection(url);
                }}
                isSavingSelection={isSavingSelection}
                canSelect={canSaveSelection}
                showCreateNewButton={canCreateNewCover}
                onCreateNew={handleCreateNew}
              />
            </div>
          </div>
        </form>
      </Form>
      <VersionHistoryPanel
        project={project}
        selectedVersionId={selectedVersionId}
        onSelectVersion={handleSelectVersionFromHistory}
      />
      {isGalleryDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 md:px-4 py-6 md:py-10 backdrop-blur">
          <div className="relative flex w-full max-w-5xl flex-col rounded-[20px] md:rounded-[32px] border border-white/15 bg-black/90 p-4 md:p-6 text-white shadow-2xl max-h-[95vh] overflow-hidden">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base md:text-lg font-semibold text-white">Gallery</p>
                <p className="text-xs md:text-sm text-white/60">
                  {isGalleryLoading
                    ? "Loading your uploads…"
                    : galleryError
                      ? "We couldn't load your uploads."
                      : galleryImages.length
                        ? `${galleryImages.length} file${galleryImages.length === 1 ? "" : "s"
                        } available`
                        : "No uploads saved yet"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start text-xs md:text-sm text-white/70 hover:text-white sm:self-auto"
                onClick={handleCloseGalleryDialog}
              >
                Close
              </Button>
            </div>
            <div className="mt-4 md:mt-6 max-h-[60vh] overflow-hidden rounded-[16px] md:rounded-[28px] border border-white/10 bg-black/40">
              {isGalleryLoading ? (
                <div className="flex min-h-[200px] md:min-h-[240px] flex-col items-center justify-center gap-3 text-white/70">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-sm">Loading gallery…</p>
                </div>
              ) : galleryError ? (
                <div className="flex min-h-[200px] md:min-h-[240px] flex-col items-center justify-center gap-4 px-4 md:px-6 text-center">
                  <p className="text-xs md:text-sm text-red-200">{galleryError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10"
                    onClick={handleRetryGalleryFetch}
                  >
                    Try again
                  </Button>
                </div>
              ) : galleryImages.length === 0 ? (
                <div className="flex min-h-[200px] md:min-h-[240px] flex-col items-center justify-center gap-2 px-4 md:px-6 text-center text-white/70">
                  <p className="text-sm md:text-base text-white">No uploads yet</p>
                  <p className="text-xs md:text-sm">
                    Upload artwork or generate covers to see them here.
                  </p>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <div className="divide-y divide-white/5">
                    {galleryImages.map((image) => {
                      const isDisabled = existingGalleryImageIds.has(image.id);
                      const isSelected = selectedGalleryIds.includes(image.id);
                      return (
                        <button
                          type="button"
                          key={image.id}
                          disabled={isDisabled}
                          onClick={() => toggleGallerySelection(image.id)}
                          className={`flex w-full items-center gap-3 md:gap-4 p-3 md:p-4 text-left transition ${isDisabled
                            ? "cursor-not-allowed opacity-50"
                            : "hover:bg-white/5"
                            }`}
                        >
                          <span
                            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${isSelected ? "border-white bg-white" : "border-white/40"
                              }`}
                            aria-hidden
                          >
                            {isSelected ? (
                              <span className="h-2 w-2 rounded-sm bg-black" />
                            ) : null}
                          </span>
                          <div className="relative h-16 w-16 md:h-20 md:w-20 flex-shrink-0 overflow-hidden rounded-xl md:rounded-2xl border border-white/10 bg-black/50">
                            <NextImage
                              src={image.uploadUrl}
                              alt={image.projectName ?? "Gallery image"}
                              fill
                              className="object-cover"
                              sizes="80px"
                            />
                          </div>
                          <div className="flex flex-1 flex-col gap-0.5 md:gap-1 min-w-0">
                            <p className="text-xs md:text-sm font-semibold text-white truncate">
                              {image.projectName ?? "Untitled project"}
                            </p>
                            <p className="text-[10px] md:text-xs text-white/60 truncate">
                              {formatGalleryDate(image.createdAt)}
                            </p>
                            <p className="text-[10px] md:text-xs text-white/70 truncate">
                              {formatGalleryDimensions(image.width, image.height)} ·{" "}
                              {formatGalleryFileSize(image.sizeBytes)}
                            </p>
                          </div>
                          <div className="text-right text-[10px] md:text-xs text-white/60 flex-shrink-0">
                            <div className="truncate max-w-[60px] md:max-w-none">{image.aspectRatioString ?? "—"}</div>
                            {isDisabled ? (
                              <p className="text-[9px] md:text-[11px] uppercase tracking-[0.3em] text-white/40">
                                Added
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 md:mt-6 flex flex-col gap-3 border-t border-white/10 pt-3 md:pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs md:text-sm text-white/70">
                {gallerySelectionCount
                  ? `${gallerySelectionCount} selected`
                  : "Select images to add them as layers."}
              </p>
              <div className="flex flex-col gap-2 md:gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs md:text-sm text-white/80 hover:text-white"
                  onClick={handleCloseGalleryDialog}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-white px-4 md:px-6 py-2 text-xs md:text-sm text-black hover:bg-slate-200 disabled:opacity-60"
                  onClick={() => void handleImportSelectedFromGallery()}
                  disabled={
                    !gallerySelectionCount || isImportingFromGallery
                  }
                >
                  {isImportingFromGallery ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 md:h-4 md:w-4 animate-spin text-black" />
                      Adding…
                    </>
                  ) : (
                    gallerySelectionCount
                      ? `Add ${gallerySelectionCount} ${gallerySelectionCount === 1 ? "image" : "images"
                      }`
                      : "Add selected"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PreviewPanelProps = {
  isLoading: boolean;
  job: SerializedThumbnailJob | null;
  onSelect?: (selectedUrl: string) => void;
  isSavingSelection?: boolean;
  canSelect?: boolean;
  showCreateNewButton?: boolean;
  onCreateNew?: () => void;
};

function PreviewPanel({
  isLoading,
  job,
  onSelect,
  isSavingSelection = false,
  canSelect = true,
  showCreateNewButton = false,
  onCreateNew,
}: PreviewPanelProps) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const previewUrls = resolveJobPreviewUrls(job);

  if (isLoading) {
    return <div className="aspect-[4/3] w-full h-full animate-pulse rounded-[16px] md:rounded-[24px] border border-white/15 bg-white/5" />;
  }

  if (!previewUrls.length) {
    return (
      <div className="flex aspect-[4/3] w-full h-full flex-col items-center justify-center gap-2 rounded-[16px] md:rounded-[24px] border border-dashed border-white/20 text-center text-[10px] md:text-xs uppercase tracking-[0.3em] md:tracking-[0.4em] text-white/40">
        Preview
      </div>
    );
  }

  const gridColumns =
    previewUrls.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";

  return (
    <div className="space-y-3 md:space-y-4">
      <div className={`grid ${gridColumns} gap-3 md:gap-4`}>
        {previewUrls.map((url, index) => {
          const isActive = selectedUrl === url;
          const toggleSelection = () =>
            setSelectedUrl((current) => (current === url ? null : url));
          const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleSelection();
            }
          };
          const handleDownloadClick = async (
            event: React.MouseEvent<HTMLButtonElement>,
          ) => {
            event.stopPropagation();
            await triggerImageDownload(url, getDownloadFileName(job, index));
          };
          const handleOpenClick = (
            event: React.MouseEvent<HTMLButtonElement>,
          ) => {
            event.stopPropagation();
            if (typeof window !== "undefined") {
              window.open(url, "_blank", "noopener,noreferrer");
            }
          };

          return (
            <div
              key={`${url}-${index}`}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={toggleSelection}
              onKeyDown={handleKeyDown}
              className={`group relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-[16px] md:rounded-[24px] border border-white/15 ${isActive ? "border-white/80" : ""
                } bg-black/70 transition hover:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80`}
            >
              <div className="absolute right-2 top-2 md:right-3 md:top-3 z-10 flex flex-col gap-1.5 md:gap-2">
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className="inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  aria-label={`Download cover option ${index + 1}`}
                >
                  <Download className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenClick}
                  className="inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  aria-label={`Open cover option ${index + 1} in new tab`}
                >
                  <ArrowUpRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </button>
              </div>
              <NextImage
                src={url}
                alt={`Generated cover option ${index + 1}`}
                fill
                className="object-contain"
                priority={index === 0}
                sizes="(min-width: 640px) 50vw, 100vw"
              />
              {isActive && onSelect ? (
                <>
                  <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/60 backdrop-blur-sm" />
                  <Button
                    type="button"
                    size="sm"
                    className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-6 md:px-8 py-3 md:py-4 text-sm md:text-base font-semibold text-black hover:bg-slate-200 disabled:opacity-60"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onSelect(url);
                    }}
                    disabled={!canSelect || isSavingSelection}
                  >
                    {isSavingSelection ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save selection"
                    )}
                  </Button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] md:text-[11px] uppercase tracking-[0.3em] text-white/60">
        <span>{job?.status}</span>
        <span>{job?.aspectRatioString}</span>
        {job?.customWidth && job?.customHeight ? (
          <span>
            {job.customWidth}×{job.customHeight}px
          </span>
        ) : null}
      </div>
      {showCreateNewButton && onCreateNew ? (
        <Button
          type="button"
          size="sm"
          className="h-10 md:h-12 w-full rounded-full border border-white/20 bg-white/10 text-xs md:text-sm font-semibold uppercase tracking-[0.3em] md:tracking-[0.4em] text-white hover:bg-white/20"
          onClick={onCreateNew}
        >
          Create new
        </Button>
      ) : null}
    </div>
  );
}

type VersionHistoryPanelProps = {
  project: SerializedCoverProject | null;
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
};

function VersionHistoryPanel({
  project,
  selectedVersionId,
  onSelectVersion,
}: VersionHistoryPanelProps) {
  if (!project) {
    return (
      <div className="rounded-[20px] md:rounded-[32px] border border-white/10 bg-black/20 px-4 md:px-6 py-6 md:py-8 text-center text-white/60">
        <p className="text-xs md:text-sm">Save a cover to start your personal library.</p>
      </div>
    );
  }

  const hasVersions = project.versions.length > 0;

  return (
    <div className="rounded-[20px] md:rounded-[32px] border border-white/10 bg-black/20 px-4 md:px-6 py-6 md:py-8">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-white/10 p-2">
          <History className="h-4 w-4 md:h-5 md:w-5 text-white" />
        </div>
        <div>
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] md:tracking-[0.4em] text-white/50">History</p>
          <p className="text-base md:text-lg font-semibold text-white">{project.name}</p>
        </div>
      </div>

      {hasVersions ? (
        <div className="mt-4 md:mt-6 grid gap-3 md:gap-4">
          {project.versions.map((version) => {
            const isActive = selectedVersionId === version.id;
            const createdAt = new Date(version.createdAt);
            const baseClasses =
              "flex w-full items-center gap-3 md:gap-4 rounded-xl md:rounded-2xl p-2 md:p-3 text-left transition hover:border-white/40";
            const activeClasses = isActive ? " border-white/70" : "";

            return (
              <button
                key={version.id}
                type="button"
                onClick={() => onSelectVersion(version.id)}
                className={`${baseClasses}${activeClasses}`}
              >
                <div className="relative h-14 w-14 md:h-16 md:w-16 flex-shrink-0 overflow-hidden rounded-lg md:rounded-xl border border-white/10">
                  <NextImage
                    src={version.selectedImageUrl}
                    alt={version.label}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm md:text-base font-semibold text-white truncate">{version.label}</p>
                  <p className="text-[10px] md:text-xs text-white/60">
                    v{version.versionNumber} · {createdAt.toLocaleDateString()}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 md:mt-6 text-xs md:text-sm text-white/60">
          Select and save a cover to start building versions for {project.name}.
        </p>
      )}
    </div>
  );
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
}

async function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function triggerImageDownload(url: string, filename?: string) {
  if (typeof window === "undefined" || typeof document === "undefined" || !url) {
    return;
  }

  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename ?? `cover-${Date.now()}.png`;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Failed to trigger download", error);
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
}

function getDownloadFileName(job: SerializedThumbnailJob | null, index?: number) {
  const baseName =
    job?.projectName?.trim() ||
    job?.projectSlug?.trim() ||
    "cover";

  const normalized = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const suffix =
    typeof index === "number" && index >= 0 ? `-${index + 1}` : "";

  return `${normalized || "cover"}${suffix}.png`;
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

function getMimeTypeForFile(file: File): AcceptedImageMimeType | null {
  const normalizedType = file.type?.toLowerCase() as AcceptedImageMimeType | undefined;
  if (normalizedType && ACCEPTED_IMAGE_TYPES.includes(normalizedType)) {
    return normalizedType;
  }

  const extension = getFileExtension(file.name);
  if (!extension) {
    return null;
  }

  return EXTENSION_TO_MIME[extension] ?? null;
}

function isZipFile(file: File) {
  const normalizedType = file.type?.toLowerCase();
  if (normalizedType && ZIP_MIME_TYPES_LOWER.includes(normalizedType)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return ZIP_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function sanitizeZipEntryName(entryName: string) {
  const segments = entryName.split(/[/\\]/).filter(Boolean);
  if (segments.length) {
    return segments[segments.length - 1]!;
  }
  const fallback = entryName.replace(/[/\\]/g, "-");
  return fallback || `image-${Date.now()}`;
}

async function extractImageFilesFromZip(file: File) {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(file);
  const imageFiles: File[] = [];

  const entries = Object.values(archive.files);
  for (const entry of entries) {
    if (entry.dir) {
      continue;
    }

    const lowerName = entry.name.toLowerCase();
    if (lowerName.startsWith("__macosx/")) {
      continue;
    }

    const sanitizedName = sanitizeZipEntryName(entry.name);
    if (sanitizedName.startsWith("._")) {
      continue;
    }

    const extension = getFileExtension(entry.name);
    if (!extension) {
      continue;
    }

    const mimeType = EXTENSION_TO_MIME[extension];
    if (!mimeType) {
      continue;
    }

    const blob = await entry.async("blob");
    imageFiles.push(
      new File([blob], sanitizedName, {
        type: mimeType,
        lastModified: Date.now(),
      }),
    );
  }

  return imageFiles;
}

function buildUploadedImagesFromMetadata(
  metadata: SanitizedImageMetadata[],
): UploadedImage[] {
  return metadata.map((item) => {
    const base = {
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      width: item.width,
      height: item.height,
      previewUrl:
        item.source.type === "url" ? item.source.url : item.source.preview,
    };

    if (item.source.type === "url") {
      return {
        ...base,
        uploadUrl: item.source.url,
      };
    }

    if (item.source.type === "base64") {
      return {
        ...base,
        base64: item.source.preview,
      };
    }

    return base;
  });
}

function buildUploadedImageFromGallery(
  image: GalleryImageSummary,
): UploadedImage {
  return {
    id: buildGalleryUploadedImageId(image.id),
    name: image.projectName ?? "Gallery image",
    previewUrl: image.uploadUrl,
    uploadUrl: image.uploadUrl,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    width: image.width ?? undefined,
    height: image.height ?? undefined,
    galleryImageId: image.id,
    checksum: image.checksum,
  };
}

function buildGalleryUploadedImageId(galleryImageId: string) {
  return `${GALLERY_UPLOAD_ID_PREFIX}${galleryImageId}`;
}

function formatGalleryFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`;
  }
  const kilobytes = bytes / 1024;
  return `${Math.max(1, Math.round(kilobytes))} KB`;
}

function formatGalleryDimensions(
  width?: number | null,
  height?: number | null,
) {
  if (!width || !height) {
    return "Unknown size";
  }
  return `${width}×${height}px`;
}

function formatGalleryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "Unknown date";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


