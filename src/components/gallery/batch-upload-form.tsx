"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type QueuedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  isZip: boolean;
};

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const ZIP_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "multipart/x-zip",
] as const;
const ZIP_EXTENSIONS = [".zip"];
const FILE_INPUT_ACCEPT = [...ACCEPTED_IMAGE_TYPES, ...ZIP_MIME_TYPES, ...ZIP_EXTENSIONS].join(",");

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

function isZipFile(file: File) {
  const normalizedType = file.type?.toLowerCase();
  if (normalizedType && ZIP_MIME_TYPES.includes(normalizedType as (typeof ZIP_MIME_TYPES)[number])) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return ZIP_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

type BatchUploadFormProps = {
  onCompleted?: () => void;
  onCancel?: () => void;
};

export function BatchUploadForm({ onCompleted, onCancel }: BatchUploadFormProps) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const zipSelected = files.some((file) => file.isZip);

  const handleFilesSelected = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList ?? []);
      if (!incoming.length) {
        return;
      }

      const hasZip = incoming.some(isZipFile);
      const zipCount = incoming.filter(isZipFile).length;

      if (zipCount > 1) {
        toast({
          title: "Too many archives",
          description: "Upload one ZIP file at a time.",
          variant: "destructive",
        });
        return;
      }

      if (hasZip && incoming.length > 1) {
        toast({
          title: "ZIP uploads only",
          description: "ZIP files cannot be mixed with other files.",
          variant: "destructive",
        });
        return;
      }

      const queued = incoming.map<QueuedFile>((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        isZip: isZipFile(file),
      }));

      setFiles(queued);
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

  const removeFile = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const handleSubmit = useCallback(async () => {
    if (!files.length) {
      toast({
        title: "Select files",
        description: "Choose images or a single ZIP archive to upload.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file.file, file.name);
    });

    setIsUploading(true);
    try {
      const response = await fetch("/api/gallery/upload", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.details ?? payload?.error ?? "Upload failed.");
      }

      toast({
        title: "Upload complete",
        description: `Added ${payload.count ?? files.length} file${(payload.count ?? files.length) === 1 ? "" : "s"
          } to your gallery.`,
      });
      setFiles([]);
      router.push("/gallery");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast({
        title: "Unable to upload",
        description: error instanceof Error ? error.message : "Unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [files, onCompleted, router, toast]);

  return (
    <section className="space-y-8 rounded-[32px] border border-white/10 bg-black p-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-white">Batch upload</h2>
        <p className="text-sm text-white/70">
          Upload a single ZIP archive or multiple PNG/JPG/WEBP files. We&rsquo;ll save everything to your gallery.
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
            <p className="text-sm uppercase tracking-[0.4em] text-white/60">Drop files</p>
            <p className="text-xs text-white/40">
              PNG · JPG · WEBP {zipSelected ? "" : "· ZIP"} · up to 60 files
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="rounded-full border border-white/15 bg-black/50 text-white hover:bg-white/10"
            onClick={() => inputRef.current?.click()}
          >
            Browse
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={FILE_INPUT_ACCEPT}
            className="hidden"
            onChange={handleFileInputChange}
          />
        </label>
      </div>

      {files.length ? (
        <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between text-sm text-white/70">
            <span>
              {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalSize)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
              Clear all
            </Button>
          </div>
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/80"
              >
                <div className="flex flex-col">
                  <span>{file.name}</span>
                  <span className="text-xs text-white/50">
                    {file.isZip ? "ZIP archive" : getFileExtension(file.name)?.toUpperCase()} · {formatBytes(file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-white/60 transition hover:text-white"
                  onClick={() => removeFile(file.id)}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

