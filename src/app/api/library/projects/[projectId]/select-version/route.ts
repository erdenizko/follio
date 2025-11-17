import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  imageUrl: z.string().url(),
});

type RouteParams = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = bodySchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json(
      { error: "InvalidPayload", details: payload.error.flatten() },
      { status: 400 },
    );
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

  if (project.libraryGenerationStatus !== "COMPLETED") {
    return NextResponse.json(
      {
        error: "NotReady",
        details: "Generation must complete before selecting a result.",
      },
      { status: 400 },
    );
  }

  const latestVersion = project.versions[0];
  if (!latestVersion) {
    return NextResponse.json(
      {
        error: "MissingVersion",
        details: "No version exists for this project yet.",
      },
      { status: 404 },
    );
  }

  if (project.libraryGenerationJobId) {
    const job = await prisma.thumbnailJob.findUnique({
      where: { id: project.libraryGenerationJobId },
    });

    if (job?.falResultUrls) {
      const allowed = Array.isArray(job.falResultUrls)
        ? job.falResultUrls.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      if (allowed.length && !allowed.includes(payload.data.imageUrl)) {
        return NextResponse.json(
          {
            error: "InvalidSelection",
            details: "Selected URL is not part of the job output.",
          },
          { status: 400 },
        );
      }
    }
  }

  await prisma.coverVersion.update({
    where: { id: latestVersion.id },
    data: {
      selectedImageUrl: payload.data.imageUrl,
    },
  });

  return NextResponse.json({ success: true }, { status: 200 });
}


