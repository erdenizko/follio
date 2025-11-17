import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { type ThumbnailJob } from "@prisma/client";

import {
  GeneratorApp,
  type SerializedCoverProject,
  type SerializedThumbnailJob,
} from "@/components/generator/generator-app";
import { AppPageLayout } from "@/components/layout/app-page-layout";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type HomeProps = {
  searchParams?: {
    projectId?: string;
    versionId?: string;
  };
};

function serializeJob(job: ThumbnailJob | null): SerializedThumbnailJob | null {
  if (!job) return null;
  
  return {
    id: job.id,
    status: job.status,
    aspectRatioId: job.aspectRatioId,
    aspectRatioString: job.aspectRatioString,
    customWidth: job.customWidth,
    customHeight: job.customHeight,
    falResultUrl: job.falResultUrl,
    falResultUrls: Array.isArray(job.falResultUrls)
      ? (job.falResultUrls as string[])
      : null,
    falRequestId: job.falRequestId,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    inputImagesMetadata:
      job.inputImagesMetadata as SerializedThumbnailJob["inputImagesMetadata"],
    projectName: job.projectName,
    projectSlug: job.projectSlug,
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: headerList,
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const jobs = await prisma.thumbnailJob.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const serializedJobs: SerializedThumbnailJob[] = jobs
    .map(serializeJob)
    .filter((job): job is SerializedThumbnailJob => job !== null);

  let initialProject: SerializedCoverProject | null = null;
  const projectId = await searchParams?.projectId ?? null;
  const versionId = await searchParams?.versionId ?? null;

  if (projectId) {
    const projectRecord = await prisma.coverProject.findFirst({
      where: { id: projectId, userId: session.user.id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            thumbnailJob: true,
          },
        },
      },
    });

    if (projectRecord) {
      initialProject = {
        id: projectRecord.id,
        name: projectRecord.name,
        slug: projectRecord.slug,
        latestVersionNumber: projectRecord.latestVersionNumber,
        versions: projectRecord.versions.map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          label: version.label,
          selectedImageUrl: version.selectedImageUrl,
          createdAt: version.createdAt.toISOString(),
          thumbnailJob: serializeJob(version.thumbnailJob),
        })),
      };
    }
  }

  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };

  return (
    <AppPageLayout label="Cover Lab" user={user}>
      <GeneratorApp
        initialJobs={serializedJobs}
        initialProject={initialProject}
        initialVersionId={versionId}
      />
    </AppPageLayout>
  );
}
