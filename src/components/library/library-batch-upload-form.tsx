"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

        const formData = new FormData();
        formData.append("file", file, file.name);

        setIsUploading(true);
        try {
            const response = await fetch("/api/library/batch-upload", {
                method: "POST",
                body: formData,
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


