"use client";

import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import JSZip from "jszip";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Checkbox } from "../ui/checkbox";

export type LibraryProjectSummary = {
    id: string;
    name: string;
    slug: string;
    latestVersionNumber: number;
    updatedAt: string;
    latestVersion?: {
        id: string;
        selectedImageUrl: string | null;
    } | null;
    librarySelected: boolean;
    libraryGenerationStatus: "WAITING" | "GENERATING" | "COMPLETED" | "FAILED";
    libraryGenerationJobId: string | null;
};

type LibraryResultsResponse = {
    project: {
        id: string;
        name: string;
    };
    version: {
        id: string;
        versionNumber: number;
    };
    results: string[];
};

const STATUS_COPY: Record<
    LibraryProjectSummary["libraryGenerationStatus"],
    { label: string; className: string }
> = {
    WAITING: {
        label: "Waiting",
        className: "bg-yellow-500/10 text-yellow-200 border-yellow-500/40",
    },
    GENERATING: {
        label: "Generating",
        className: "bg-blue-500/10 text-blue-200 border-blue-500/40",
    },
    COMPLETED: {
        label: "Completed",
        className: "bg-emerald-500/10 text-emerald-200 border-emerald-500/40",
    },
    FAILED: {
        label: "Failed",
        className: "bg-red-500/10 text-red-200 border-red-500/40",
    },
};

export function LibraryProjectsSection({
    projects,
}: {
    projects: LibraryProjectSummary[];
}) {
    const router = useRouter();
    const { toast } = useToast();
    const [queuePending, startQueueTransition] = useTransition();
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
        () =>
            new Set(
                projects
                    .filter((project) => project.librarySelected)
                    .map((project) => project.id),
            ),
    );
    const [resultsProject, setResultsProject] = useState<LibraryProjectSummary | null>(null);
    const [resultsData, setResultsData] = useState<LibraryResultsResponse | null>(null);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [resultsError, setResultsError] = useState<string | null>(null);
    const [selectPendingUrl, setSelectPendingUrl] = useState<string | null>(null);
    const [selectPending, startSelectTransition] = useTransition();
    const [downloadPending, setDownloadPending] = useState(false);

    useEffect(() => {
        setSelectedProjectIds((previous) => {
            const next = new Set<string>();
            projects.forEach((project) => {
                if (previous.has(project.id) || project.librarySelected) {
                    next.add(project.id);
                }
            });
            return next;
        });
    }, [projects]);

    const selectedCount = useMemo(
        () => selectedProjectIds.size,
        [selectedProjectIds],
    );

    const toggleSelection = (projectId: string) => {
        setSelectedProjectIds((current) => {
            const next = new Set(current);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });
    };

    const handleQueueGeneration = () => {
        if (!selectedCount || queuePending) {
            return;
        }

        startQueueTransition(async () => {
            try {
                const response = await fetch("/api/library/generate-selection", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        projectIds: Array.from(selectedProjectIds),
                    }),
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.details ?? payload?.error ?? "Unable to start generation.");
                }

                const summary = payload?.summary;
                const description = summary
                    ? `Completed ${summary.completed} of ${summary.processed} project${summary.processed === 1 ? "" : "s"}.`
                    : "Selected projects moved to the queue.";

                toast({
                    title: "Generation queued",
                    description,
                });
                router.refresh();
            } catch (error) {
                console.error(error);
                toast({
                    title: "Unable to start generation",
                    description: error instanceof Error ? error.message : "Unexpected error occurred.",
                    variant: "destructive",
                });
            }
        });
    };

    const openResultsDialog = (project: LibraryProjectSummary) => {
        setResultsProject(project);
        setResultsData(null);
        setResultsError(null);
        setResultsLoading(true);

        fetch(`/api/library/projects/${project.id}/results`)
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.details ?? payload?.error ?? "Unable to load results.");
                }

                setResultsData(payload as LibraryResultsResponse);
            })
            .catch((error) => {
                console.error(error);
                setResultsError(
                    error instanceof Error ? error.message : "Unexpected error occurred.",
                );
            })
            .finally(() => {
                setResultsLoading(false);
            });
    };

    const closeResultsDialog = () => {
        setResultsProject(null);
        setResultsData(null);
        setResultsError(null);
        setSelectPendingUrl(null);
    };

    const handleSelectResult = (imageUrl: string) => {
        if (!resultsProject) {
            return;
        }
        setSelectPendingUrl(imageUrl);
        startSelectTransition(async () => {
            try {
                const response = await fetch(
                    `/api/library/projects/${resultsProject.id}/select-version`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ imageUrl }),
                    },
                );
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(payload?.details ?? payload?.error ?? "Unable to select result.");
                }

                toast({
                    title: "Cover updated",
                    description: "Your selection has replaced the active version.",
                });
                closeResultsDialog();
                router.refresh();
            } catch (error) {
                console.error(error);
                toast({
                    title: "Unable to select result",
                    description: error instanceof Error ? error.message : "Unexpected error occurred.",
                    variant: "destructive",
                });
            } finally {
                setSelectPendingUrl(null);
            }
        });
    };

    const handleDownloadAllCovers = async () => {
        if (downloadPending || !selectedCount) {
            return;
        }

        // Filter selected projects that have cover images
        const projectsWithCovers = projects.filter(
            (project) =>
                selectedProjectIds.has(project.id) &&
                project.latestVersion?.selectedImageUrl
        );

        if (projectsWithCovers.length === 0) {
            toast({
                title: "No covers to download",
                description: "None of the selected projects have cover images yet.",
                variant: "destructive",
            });
            return;
        }

        setDownloadPending(true);

        try {
            const zip = new JSZip();

            // Fetch all images and add them to the zip
            await Promise.all(
                projectsWithCovers.map(async (project) => {
                    try {
                        const imageUrl = project.latestVersion!.selectedImageUrl!;
                        const response = await fetch(imageUrl);

                        if (!response.ok) {
                            throw new Error(`Failed to fetch ${project.name}`);
                        }

                        const blob = await response.blob();

                        // Get file extension from URL or blob type
                        const urlExtension = imageUrl.split('.').pop()?.split('?')[0];
                        const extension = urlExtension || 'jpg';

                        // Sanitize project name for filename
                        const safeName = project.name.replace(/[^a-zA-Z0-9-_]/g, '_');
                        const fileName = `${safeName}_v${project.latestVersionNumber}.${extension}`;

                        zip.file(fileName, blob);
                    } catch (error) {
                        console.error(`Failed to add ${project.name} to zip:`, error);
                        // Continue with other images even if one fails
                    }
                })
            );

            // Generate and download the zip file
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const downloadUrl = URL.createObjectURL(zipBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `covers_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);

            toast({
                title: "Download complete",
                description: `Downloaded ${projectsWithCovers.length} cover image${projectsWithCovers.length === 1 ? "" : "s"}.`,
            });
        } catch (error) {
            console.error(error);
            toast({
                title: "Download failed",
                description: error instanceof Error ? error.message : "Unable to download covers.",
                variant: "destructive",
            });
        } finally {
            setDownloadPending(false);
        }
    };

    return (
        <section className="flex flex-col gap-6">
            {selectedCount > 0 ? (
                <div className="flex flex-col items-center justify-between lg:flex-row gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[32px] border border-white/10 bg-black/40 px-6 py-4">
                        <div>
                            <p className="text-sm text-white/70">
                                {selectedCount} project{selectedCount === 1 ? "" : "s"} selected
                            </p>
                            <p className="text-xs text-white/40">
                                Toggle selections below, then create cover images or download existing covers.
                            </p>
                        </div>
                        {selectedCount ? (
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    onClick={handleQueueGeneration}
                                    disabled={queuePending}
                                    className="rounded-full bg-white text-black hover:bg-slate-200"
                                >
                                    {queuePending ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Starting…
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <PlayCircle className="h-4 w-4" />
                                            Create cover images for selection
                                        </span>
                                    )}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                    <div className="flex justify-end flex-wrap gap-2">
                        <Button
                            type="button"
                            onClick={handleDownloadAllCovers}
                            disabled={downloadPending}
                            variant="outline"
                            className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        >
                            {downloadPending ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Downloading…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Download className="h-4 w-4" />
                                    Download all covers
                                </span>
                            )}
                        </Button>
                    </div>
                </div>
            ) : null}
            <div className="flex flex-col gap-4">
                {projects.map((project) => {
                    const status = STATUS_COPY[project.libraryGenerationStatus];
                    const hasPreview = Boolean(project.latestVersion?.selectedImageUrl);
                    const isSelected = selectedProjectIds.has(project.id);

                    return (
                        <article
                            key={project.id}
                            className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-black/60 p-4 sm:flex-row sm:items-center sm:gap-6"
                        >
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelection(project.id)}
                                className="size-8 rounded-full border border-white/10 bg-white/5 text-white"
                            />
                            <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:w-52">
                                {hasPreview ? (
                                    <NextImage
                                        src={project.latestVersion!.selectedImageUrl ?? ""}
                                        alt={project.name}
                                        fill
                                        className="object-cover"
                                        sizes="208px"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.4em] text-white/40">
                                        Pending
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-1 flex-col gap-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="text-xl font-semibold text-white">{project.name}</h3>
                                        <p className="text-sm text-white/60">
                                            {project.latestVersionNumber} version
                                            {project.latestVersionNumber === 1 ? "" : "s"} · Updated{" "}
                                            {new Date(project.updatedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {project.libraryGenerationStatus === "COMPLETED" ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="text-white/80 hover:text-white"
                                                onClick={() => openResultsDialog(project)}
                                                disabled={
                                                    resultsLoading && resultsProject?.id === project.id
                                                }
                                            >
                                                {resultsLoading && resultsProject?.id === project.id ? (
                                                    <span className="flex items-center gap-1">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Loading…
                                                    </span>
                                                ) : (
                                                    "View results"
                                                )}
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            {resultsProject ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-10">
                    <div className="w-full max-w-5xl rounded-[32px] border border-white/10 bg-black/90 p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                            <div>
                                <p className="text-sm uppercase tracking-[0.4em] text-white/60">Results</p>
                                <h3 className="text-2xl font-semibold text-white">{resultsProject.name}</h3>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-white/70 hover:text-white"
                                onClick={closeResultsDialog}
                            >
                                Close
                            </Button>
                        </div>

                        <div className="mt-6 min-h-[200px]">
                            {resultsLoading ? (
                                <div className="flex items-center justify-center text-white/70">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : resultsError ? (
                                <p className="text-center text-sm text-red-400">{resultsError}</p>
                            ) : resultsData?.results?.length ? (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {resultsData.results.map((url) => (
                                        <div
                                            key={url}
                                            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/60 p-3"
                                        >
                                            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10">
                                                <NextImage
                                                    src={url}
                                                    alt="Generation result"
                                                    fill
                                                    className="object-cover"
                                                    sizes="(min-width: 1024px) 360px, 90vw"
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    className="rounded-full bg-white text-black hover:bg-slate-200"
                                                    onClick={() => handleSelectResult(url)}
                                                    disabled={selectPending || selectPendingUrl === url}
                                                >
                                                    {selectPending && selectPendingUrl === url ? "Applying…" : "Use this cover"}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-full border-white/30 text-white/80 hover:text-white"
                                                    asChild
                                                >
                                                    <a href={url} target="_blank" rel="noreferrer">
                                                        <ExternalLink className="mr-2 h-4 w-4" />
                                                        Open
                                                    </a>
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="rounded-full text-white/80 hover:text-white"
                                                    asChild
                                                >
                                                    <a href={url} download>
                                                        <Download className="mr-2 h-4 w-4" />
                                                        Download
                                                    </a>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-sm text-white/60">
                                    No generation results available for this project.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}


