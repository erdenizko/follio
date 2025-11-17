import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const headerList = await headers();
    const session = await auth.api.getSession({
      headers: headerList,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const images = await prisma.galleryImage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    const serialized = images.map((image) => ({
      id: image.id,
      projectName: image.projectName,
      projectSlug: image.projectSlug,
      uploadUrl: image.uploadUrl,
      checksum: image.checksum,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      width: image.width,
      height: image.height,
      aspectRatioString: image.aspectRatioString,
      createdAt: image.createdAt.toISOString(),
    }));

    return NextResponse.json({ images: serialized });
  } catch (error) {
    console.error("[api/gallery] failed to fetch images", error);
    return NextResponse.json(
      { error: "Failed to load gallery images" },
      { status: 500 },
    );
  }
}


