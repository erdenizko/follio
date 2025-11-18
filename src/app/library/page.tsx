import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppPageLayout } from "@/components/layout/app-page-layout";
import { Button } from "@/components/ui/button";
import { LibraryBatchUploadDialog } from "@/components/library/library-batch-upload-dialog";
import { LibraryProjectsSection } from "@/components/library/library-projects-section";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LibraryPage() {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: headerList,
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const projects = await prisma.coverProject.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };

  type ProjectWithStatus = (typeof projects)[number] & {
    librarySelected: boolean;
    libraryGenerationStatus: "WAITING" | "GENERATING" | "COMPLETED" | "FAILED";
    libraryGenerationJobId: string | null;
  };

  const serializedProjects = (projects as ProjectWithStatus[]).map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    latestVersionNumber: project.latestVersionNumber,
    updatedAt: project.updatedAt.toISOString(),
    latestVersion: project.versions[0]
      ? {
        id: project.versions[0].id,
        selectedImageUrl: project.versions[0].selectedImageUrl,
        sourceImage1Url: project.versions[0].sourceImage1Url,
        sourceImage2Url: project.versions[0].sourceImage2Url,
        sourceImage3Url: project.versions[0].sourceImage3Url,
      }
      : null,
    librarySelected: project.librarySelected,
    libraryGenerationStatus: project.libraryGenerationStatus,
    libraryGenerationJobId: project.libraryGenerationJobId ?? null,
  }));

  return (
    <AppPageLayout label="Library" user={user}>
      <div className="flex flex-row flex-wrap items-center justify-between gap-3 rounded-[32px] border border-white/10 bg-black/20 px-6 py-4">
        <div className="w-64 md:w-full md:max-w-2xl">
          <p className="text-xs md:text-sm text-white/70">
            Import a ZIP structured as <code>root/&lt;project-name&gt;/&lt;images&gt;</code> to
            batch create versions in your library.
          </p>
        </div>
        <LibraryBatchUploadDialog label="Batch upload" />
      </div>
      {serializedProjects.length ? (
        <LibraryProjectsSection projects={serializedProjects} />
      ) : (
        <div className="rounded-[32px] border border-white/10 bg-black/20 px-6 py-16 text-center text-white/60">
          <p className="text-lg font-medium text-white">No saved covers yet</p>
          <p className="mt-2 text-sm">
            Generate a cover, select your favorite result, and we&apos;ll store each version here.
          </p>
          <Button asChild className="mt-6 rounded-full bg-white text-black hover:bg-slate-200">
            <Link href="/">Start creating</Link>
          </Button>
        </div>
      )}
    </AppPageLayout>
  );
}

