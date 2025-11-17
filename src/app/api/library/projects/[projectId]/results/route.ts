import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{
    projectId: string;
  }>;
};

function normalizeUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  const project = await prisma.coverProject.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "NotFound", details: "Project not found." },
      { status: 404 },
    );
  }

  const latestVersion = project.versions[0];
  if (!latestVersion) {
    return NextResponse.json(
      {
        error: "MissingVersion",
        details: "No version is associated with this project yet.",
      },
      { status: 404 },
    );
  }

  let results: string[] = [];

  // First try to get results from the version (new approach)
  if (latestVersion.generatedImageUrls) {
    results = normalizeUrls(latestVersion.generatedImageUrls);
  }

  // Fall back to job's falResultUrls (for versions created before the migration)
  if (!results.length && latestVersion.thumbnailJobId) {
    const job = await prisma.thumbnailJob.findUnique({
      where: { id: latestVersion.thumbnailJobId },
      select: { falResultUrls: true },
    });

    if (job?.falResultUrls) {
      results = normalizeUrls(job.falResultUrls);
    }
  }

  if (!results.length) {
    return NextResponse.json(
      {
        error: "NoResults",
        details: "No generated images found for this version.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      project: {
        id: project.id,
        name: project.name,
      },
      version: {
        id: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
      },
      results,
    },
    { status: 200 },
  );
}


