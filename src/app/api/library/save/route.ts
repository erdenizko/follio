import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugifyProjectName } from "@/lib/utils";
import { saveCoverVersionSchema } from "@/lib/validation/library";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const { jobId, selectedImageUrl } = saveCoverVersionSchema.parse(rawBody);

    const job = await prisma.thumbnailJob.findFirst({
      where: {
        id: jobId,
        userId: session.user.id,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "NotFound", details: "Job not found." },
        { status: 404 },
      );
    }

    if (job.status !== "SUCCESS" || !job.falResultUrl) {
      return NextResponse.json(
        { error: "JobNotReady", details: "Generate a cover before saving it." },
        { status: 400 },
      );
    }

    const normalizedProjectName = (job.projectName ?? "").trim();
    if (!normalizedProjectName) {
      return NextResponse.json(
        { error: "MissingName", details: "This job was created without a name." },
        { status: 400 },
      );
    }

    const projectSlug =
      job.projectSlug ?? slugifyProjectName(normalizedProjectName);
    const resultUrl = selectedImageUrl ?? job.falResultUrl;

    const allGeneratedUrls = job.falResultUrls
      ? (Array.isArray(job.falResultUrls)
          ? job.falResultUrls.filter((url): url is string => typeof url === "string")
          : [])
      : [];

    const { project, version } = await prisma.$transaction(async (tx) => {
      const existingProject = await tx.coverProject.findUnique({
        where: {
          userId_slug: {
            userId: session.user.id,
            slug: projectSlug,
          },
        },
      });

      let versionNumber = 1;
      let projectRecord;

      if (existingProject) {
        versionNumber = existingProject.latestVersionNumber + 1;
        projectRecord = await tx.coverProject.update({
          where: { id: existingProject.id },
          data: {
            name: normalizedProjectName,
            latestVersionNumber: versionNumber,
          },
        });
      } else {
        projectRecord = await tx.coverProject.create({
          data: {
            userId: session.user.id,
            name: normalizedProjectName,
            slug: projectSlug,
            latestVersionNumber: versionNumber,
          },
        });
      }

      const label = `${projectRecord.slug}_v${versionNumber}`;
      const versionRecord = await tx.coverVersion.create({
        data: {
          projectId: projectRecord.id,
          thumbnailJobId: job.id,
          versionNumber,
          label,
          selectedImageUrl: resultUrl,
          generatedImageUrls: allGeneratedUrls.length
            ? (allGeneratedUrls as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      return {
        project: projectRecord,
        version: versionRecord,
      };
    });

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        latestVersionNumber: project.latestVersionNumber,
      },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        label: version.label,
        selectedImageUrl: version.selectedImageUrl,
        createdAt: version.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "ValidationError", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("[library/save] failed", error);
    return NextResponse.json(
      {
        error: "LibrarySaveFailed",
        details: error instanceof Error ? error.message : "Unexpected error.",
      },
      { status: 500 },
    );
  }
}

