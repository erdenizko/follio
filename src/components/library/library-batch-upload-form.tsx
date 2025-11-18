"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadToCloudinary } from "@/lib/client-cloudinary";
import { slugifyProjectName } from "@/lib/utils";
import type { GenerationImageInput } from "@/lib/validation/generate";

type LibraryBatchUploadFormProps = {
    onCompleted?: () => void;
    onCancel?: () => void;
};

const ZIP_MIME_TYPES = [
    "application/zip",
    "application/x-zip-compressed",
    "application/x-zip",
    "multipart/x-zip",
] as const;
const ZIP_EXTENSIONS = [".zip"];
const FILE_INPUT_ACCEPT = [...ZIP_MIME_TYPES, ...ZIP_EXTENSIONS].join(",");

function formatBytes(bytes: number) {
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

function isZipFile(file: File) {
    if (ZIP_MIME_TYPES.includes(file.type as (typeof ZIP_MIME_TYPES)[number])) {
        return true;
    }

    const lowerName = file.name.toLowerCase();
    return ZIP_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const EXTENSION_TO_MIME: Record<string, (typeof ACCEPTED_IMAGE_TYPES)[number]> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
};

const MAX_IMAGES_PER_PROJECT = 3;

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

type ProjectGroup = {
    slug: string;
    name: string;
    inputs: GenerationImageInput[];
};

async function extractArchiveProjects(file: File): Promise<Map<string, ProjectGroup>> {
    const archive = await JSZip.loadAsync(file);
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

        const blob = await entry.async("blob");
        if (!blob.size) continue;

        // Create a File object from the blob for Cloudinary upload
        const imageFile = new File([blob], sanitizeFileName(relativeName), {
            type: mimeType,
            lastModified: Date.now(),
        });

        const existing = groups.get(slug);
        if (existing) {
            if (existing.inputs.length >= MAX_IMAGES_PER_PROJECT) {
                continue;
            }
            existing.inputs.push({
                id: crypto.randomUUID(),
                name: sanitizeFileName(relativeName),
                mimeType,
                sizeBytes: blob.size,
                file: imageFile, // Store file for later upload
            } as GenerationImageInput & { file: File });
            continue;
        }

        groups.set(slug, {
            slug,
            name: projectName,
            inputs: [
                {
                    id: crypto.randomUUID(),
                    name: sanitizeFileName(relativeName),
                    mimeType,
                    sizeBytes: blob.size,
                    file: imageFile, // Store file for later upload
                } as GenerationImageInput & { file: File },
            ],
        });
    }

    return groups;
}

export function LibraryBatchUploadForm({
    onCompleted,
    onCancel,
}: LibraryBatchUploadFormProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const handleFilesSelected = useCallback(
        (fileList: FileList | File[]) => {
            const next = fileList && fileList.length ? fileList[0] : null;
            if (!next) {
                return;
            }

            if (!isZipFile(next)) {
                toast({
                    title: "ZIP required",
                    description: "Select a single .zip file structured by project folders.",
                    variant: "destructive",
                });
                return;
            }

            if (fileList.length > 1) {
                toast({
                    title: "Single ZIP only",
                    description: "Upload one archive at a time.",
                    variant: "destructive",
                });
                return;
            }

            setFile(next);
        },
        [toast],
    );

    const handleFileInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            handleFilesSelected(event.target.files ?? []);
            event.target.value = "";
        },
        [handleFilesSelected],
    );

    const handleDrop = useCallback(
        (event: React.DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            handleFilesSelected(event.dataTransfer.files ?? []);
        },
        [handleFilesSelected],
    );

    const removeFile = useCallback(() => setFile(null), []);

    const handleSubmit = useCallback(async () => {
        if (!file) {
            toast({
                title: "Select a ZIP file",
                description: "Choose the archive you want to import.",
                variant: "destructive",
            });
            return;
        }

        setIsUploading(true);
        try {
            // Step 1: Extract ZIP and organize by projects
            toast({
                title: "Extracting archive...",
                description: "Reading ZIP file structure",
            });

            const projectGroups = await extractArchiveProjects(file);
            const totalImages = Array.from(projectGroups.values()).reduce(
                (acc, group) => acc + group.inputs.length,
                0,
            );

            if (totalImages === 0) {
                throw new Error("No supported images were found under project folders.");
            }

            if (totalImages > 60) {
                throw new Error("Upload up to 60 images per archive.");
            }

            // Step 2: Upload all images to Cloudinary
            toast({
                title: "Uploading images...",
                description: `Uploading ${totalImages} image${totalImages === 1 ? "" : "s"} to cloud storage`,
            });

            const projectsWithUploads: Array<{
                slug: string;
                name: string;
                inputs: GenerationImageInput[];
            }> = [];

            for (const group of projectGroups.values()) {
                const uploadedInputs: GenerationImageInput[] = [];

                for (const input of group.inputs) {
                    const file = (input as GenerationImageInput & { file: File }).file;
                    if (!file) continue;

                    try {
                        const result = await uploadToCloudinary(file);
                        uploadedInputs.push({
                            id: input.id,
                            name: input.name,
                            uploadUrl: result.secure_url,
                            mimeType: input.mimeType,
                            sizeBytes: result.bytes,
                            width: result.width,
                            height: result.height,
                        });
                    } catch (error) {
                        console.error(`Failed to upload ${input.name}:`, error);
                        throw new Error(`Failed to upload ${input.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
                    }
                }

                if (uploadedInputs.length > 0) {
                    projectsWithUploads.push({
                        slug: group.slug,
                        name: group.name,
                        inputs: uploadedInputs,
                    });
                }
            }

            // Step 3: Send metadata to API
            toast({
                title: "Processing...",
                description: "Creating projects and versions",
            });

            const response = await fetch("/api/library/batch-upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    projects: projectsWithUploads,
                }),
            });

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.details ?? payload?.error ?? "Upload failed.");
            }

            const stats = payload?.stats;
            toast({
                title: "Batch upload complete",
                description: stats
                    ? `Imported ${stats.assets} source image${stats.assets === 1 ? "" : "s"} across ${stats.projects} project${stats.projects === 1 ? "" : "s"}.`
                    : "Your projects were imported successfully.",
            });
            setFile(null);
            router.refresh();
            onCompleted?.();
        } catch (error) {
            console.error(error);
            toast({
                title: "Unable to upload",
                description:
                    error instanceof Error
                        ? error.message
                        : "Unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsUploading(false);
        }
    }, [file, onCompleted, router, toast]);

    const helperText = useMemo(() => {
        if (!file) {
            return "Zip structure: root/<project-name>/<image-files> (max 3 images)";
        }
        return `${file.name} · ${formatBytes(file.size)}`;
    }, [file]);

    return (
        <section className="space-y-8 rounded-[32px] border border-white/10 bg-black p-8">
            <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-white">Batch upload</h2>
                <p className="text-sm text-white/70">
                    Import a single ZIP file containing folders per project. Each folder
                    should include up to three source images that we&apos;ll use for future generations.
                </p>
            </div>

            <div className="space-y-4">
                <label
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                    className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-white/20 bg-black/40 text-center transition hover:border-white/60"
                >
                    <UploadCloud className="h-10 w-10 text-white/80" />
                    <div>
                        <p className="text-sm uppercase tracking-[0.4em] text-white/60">
                            Drop ZIP
                        </p>
                        <p className="text-xs text-white/40">{helperText}</p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full border border-white/15 bg-black/50 text-white hover:bg-white/10"
                        onClick={() => inputRef.current?.click()}
                        disabled={isUploading}
                    >
                        Browse
                    </Button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={FILE_INPUT_ACCEPT}
                        className="hidden"
                        onChange={handleFileInputChange}
                    />
                </label>
            </div>

            {file ? (
                <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between text-sm text-white/70">
                        <span>Selected archive</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={removeFile}
                            disabled={isUploading}
                        >
                            Clear
                        </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80">
                        <div className="flex flex-col">
                            <span>{file.name}</span>
                            <span className="text-xs text-white/50">
                                ZIP archive · {formatBytes(file.size)}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="text-white/60 transition hover:text-white"
                            onClick={removeFile}
                            aria-label={`Remove ${file.name}`}
                            disabled={isUploading}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="space-y-2 rounded-[20px] border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <p className="font-semibold text-white">Requirements</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Folder names map to project names.</li>
                    <li>Images must be PNG, JPG, or WEBP (first 3 per folder are used).</li>
                    <li>Existing project names reuse the same project slot.</li>
                </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                    type="button"
                    variant="ghost"
                    className="text-white/80 hover:text-white"
                    onClick={() => onCancel?.()}
                    disabled={isUploading}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    className="rounded-full bg-white text-black hover:bg-slate-200"
                    onClick={handleSubmit}
                    disabled={isUploading}
                >
                    {isUploading ? "Uploading…" : "Upload"}
                </Button>
            </div>
        </section>
    );
}


