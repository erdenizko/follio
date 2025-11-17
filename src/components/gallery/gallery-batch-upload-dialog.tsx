"use client";

import { useCallback, useState } from "react";

import { BatchUploadForm } from "@/components/gallery/batch-upload-form";
import { Button } from "@/components/ui/button";
import type { HeaderActionVariant } from "@/components/layout/app-header";
import { cn } from "@/lib/utils";

type GalleryBatchUploadDialogProps = {
    label?: string;
    variant?: HeaderActionVariant;
};

export function GalleryBatchUploadDialog({
    label = "Batch Upload",
    variant = "outline",
}: GalleryBatchUploadDialogProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleOpen = useCallback(() => setIsOpen(true), []);
    const handleClose = useCallback(() => setIsOpen(false), []);

    return (
        <>
            <Button
                type="button"
                variant={variant === "outline" ? "outline" : "default"}
                className={cn(
                    "flex items-center gap-2",
                    variant === "outline"
                        ? "rounded-full border-white/20 bg-white/5 text-slate-100 hover:bg-white/10"
                        : "rounded-full bg-white text-black hover:bg-slate-200",
                )}
                onClick={handleOpen}
            >
                {label}
            </Button>

            {isOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-xl transition-all duration-300 px-4 py-10">
                    <div className="relative w-full max-w-3xl">
                        <div className="absolute right-4 top-4 z-10">
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-white/70 hover:text-white"
                                onClick={handleClose}
                            >
                                Close
                            </Button>
                        </div>
                        <BatchUploadForm onCompleted={handleClose} onCancel={handleClose} />
                    </div>
                </div>
            ) : null}
        </>
    );
}

