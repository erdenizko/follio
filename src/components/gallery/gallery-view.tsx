"use client";

import NextImage from "next/image";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SerializedGalleryImage = {
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

export type GalleryProjectOption = {
  slug: string | null;
  name: string | null;
};

type GalleryViewProps = {
  images: SerializedGalleryImage[];
  projects: GalleryProjectOption[];
};

const ALL_VALUE = "all";
const UNTITLED_VALUE = "__untitled__";

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

function formatDimensions(width?: number | null, height?: number | null) {
  if (!width || !height) {
    return "Unknown";
  }

  return `${width}×${height}`;
}

function formatChecksum(checksum: string) {
  if (!checksum) {
    return "—";
  }

  if (checksum.length <= 14) {
    return checksum;
  }

  return `${checksum.slice(0, 8)}…${checksum.slice(-6)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "Unknown";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GalleryView({ images, projects }: GalleryViewProps) {
  const [selectedProject, setSelectedProject] = useState<string>(ALL_VALUE);

  const derivedProjects = useMemo(() => {
    if (projects.length) {
      return projects;
    }

    const map = new Map<string, GalleryProjectOption>();
    for (const image of images) {
      const key = image.projectSlug ?? UNTITLED_VALUE;
      if (!map.has(key)) {
        map.set(key, {
          slug: image.projectSlug,
          name: image.projectName,
        });
      }
    }
    return Array.from(map.values());
  }, [images, projects]);

  const selectOptions = useMemo(
    () =>
      derivedProjects.map((project) => ({
        value: project.slug ?? UNTITLED_VALUE,
        label: project.name ?? "Untitled project",
      })),
    [derivedProjects],
  );

  const filteredImages = useMemo(() => {
    if (selectedProject === ALL_VALUE) {
      return images;
    }

    return images.filter(
      (image) => (image.projectSlug ?? UNTITLED_VALUE) === selectedProject,
    );
  }, [images, selectedProject]);

  const activeProjectLabel =
    selectedProject === ALL_VALUE
      ? "All projects"
      : selectOptions.find((option) => option.value === selectedProject)?.label ??
      "Project";

  if (!images.length) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-black/20 px-6 py-16 text-center text-white/60">
        <p className="text-lg font-medium text-white">No uploads yet</p>
        <p className="mt-2 text-sm">
          Create a cover, upload your source assets, and we&apos;ll archive them
          here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-base font-semibold text-white">Uploads</p>
          <p className="text-sm text-white/60">
            {filteredImages.length} file
            {filteredImages.length === 1 ? "" : "s"} · {activeProjectLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px]">
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
            >
              <SelectTrigger className="h-11 rounded-2xl border-white/20 bg-black/60 text-slate-100">
                <SelectValue placeholder="Filter projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All projects</SelectItem>
                {selectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProject !== ALL_VALUE ? (
            <Button
              type="button"
              variant="ghost"
              className="text-white/80 hover:text-white"
              onClick={() => setSelectedProject(ALL_VALUE)}
            >
              Clear filter
            </Button>
          ) : null}
        </div>
      </div>

      {filteredImages.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-black/30 px-6 py-12 text-center text-white/60">
          <p className="text-base text-white/80">
            No uploads match this project.
          </p>
          <p className="text-sm">
            Try switching back to &ldquo;All projects&rdquo; to see everything.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {filteredImages.map((image) => (
            <article
              key={image.id}
              className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-black p-3"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                <NextImage
                  src={image.uploadUrl}
                  alt={image.projectName ?? "Gallery upload"}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1280px) 320px, (min-width: 768px) 45vw, 90vw"
                />
              </div>
              <div className="flex flex-col gap-2 text-white">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {image.projectName ?? "Untitled project"} <br />
                    <p className="text-xs text-white/60">
                      {formatDate(image.createdAt)}
                    </p>
                  </h3>
                  {image.aspectRatioString ? (
                    <Badge variant="outline" className="border-white/30 text-white/80">
                      {image.aspectRatioString}
                    </Badge>
                  ) : null}
                </div>
                <ul className="text-xs text-white/70 space-y-1">
                  <li>Dimensions: {formatDimensions(image.width, image.height)}</li>
                  <li>File size: {formatBytes(image.sizeBytes)}</li>
                  <li>Type: {image.mimeType}</li>
                  <li>Checksum: {formatChecksum(image.checksum)}</li>
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

