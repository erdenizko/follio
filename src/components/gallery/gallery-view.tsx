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
      <div className="rounded-[20px] md:rounded-[32px] border border-white/10 bg-black/20 px-4 md:px-6 py-12 md:py-16 text-center text-white/60">
        <p className="text-base md:text-lg font-medium text-white">No uploads yet</p>
        <p className="mt-2 text-xs md:text-sm">
          Create a cover, upload your source assets, and we&apos;ll archive them
          here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <div className="flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm md:text-base font-semibold text-white">Uploads</p>
          <p className="text-xs md:text-sm text-white/60">
            {filteredImages.length} file
            {filteredImages.length === 1 ? "" : "s"} · {activeProjectLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 md:gap-3">
          <div className="w-full sm:min-w-[200px] md:min-w-[220px]">
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
            >
              <SelectTrigger className="h-10 md:h-11 rounded-xl md:rounded-2xl border-white/20 bg-black/60 text-slate-100 text-sm">
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
              size="sm"
              className="text-xs md:text-sm text-white/80 hover:text-white w-full sm:w-auto"
              onClick={() => setSelectedProject(ALL_VALUE)}
            >
              Clear filter
            </Button>
          ) : null}
        </div>
      </div>

      {filteredImages.length === 0 ? (
        <div className="rounded-[18px] md:rounded-[28px] border border-white/10 bg-black/30 px-4 md:px-6 py-8 md:py-12 text-center text-white/60">
          <p className="text-sm md:text-base text-white/80">
            No uploads match this project.
          </p>
          <p className="text-xs md:text-sm">
            Try switching back to &ldquo;All projects&rdquo; to see everything.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-1 md:grid-cols-4 xl:grid-cols-5">
          {filteredImages.map((image) => (
            <article
              key={image.id}
              className="flex flex-row md:flex-col items-center gap-3 md:gap-4 rounded-[20px] md:rounded-[32px] border border-white/10 bg-black p-2.5 md:px-1 md:py-4"
            >
              <div className="relative min-w-24 min-h-24 aspect-[4/3] overflow-hidden rounded-lg md:rounded-xl">
                <NextImage
                  src={image.uploadUrl}
                  alt={image.projectName ?? "Gallery upload"}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1280px) 240px, (min-width: 1024px) 280px, (min-width: 640px) 45vw, 95vw"
                />
              </div>
              <div className="w-full px-2 md:px-4 flex flex-col gap-1.5 md:gap-2 text-white">
                <div className="flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm md:text-base lg:text-lg font-semibold tracking-tight leading-tight flex-1">
                      {image.projectName ?? "Untitled project"}
                    </h3>
                  </div>
                  <p className="text-[10px] md:text-sm text-white/60">
                    {formatDate(image.createdAt)}
                  </p>
                </div>
                <ul className="text-[10px] md:text-xs text-white/70 space-y-0.5">
                  <li>Dimensions: {formatDimensions(image.width, image.height)}</li>
                  <li>File size: {formatBytes(image.sizeBytes)}</li>
                  <li className="hidden sm:block">Type: {image.mimeType}</li>
                  <li className="hidden md:block">Checksum: {formatChecksum(image.checksum)}</li>
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

