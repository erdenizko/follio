"use client";

import { useCallback, useState } from "react";

import { LibraryBatchUploadForm } from "@/components/library/library-batch-upload-form";
import { Button } from "@/components/ui/button";

type LibraryBatchUploadDialogProps = {
    label?: string;
};

export function LibraryBatchUploadDialog({
    label = "Batch upload",
}: LibraryBatchUploadDialogProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleOpen = useCallback(() => setIsOpen(true), []);
    const handleClose = useCallback(() => setIsOpen(false), []);

    return (
        <>
            <Button
                type="button"
                className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-slate-200"
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
                        <LibraryBatchUploadForm
                            onCompleted={handleClose}
                            onCancel={handleClose}
                        />
                    </div>
                </div>
            ) : null}
        </>
    );
}


