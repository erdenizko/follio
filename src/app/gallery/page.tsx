import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppPageLayout } from "@/components/layout/app-page-layout";
import {
  GalleryView,
  type GalleryProjectOption,
  type SerializedGalleryImage,
} from "@/components/gallery/gallery-view";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function GalleryPage() {
  const headerList = await headers();
  const session = await auth.api.getSession({
    headers: headerList,
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const images = await prisma.galleryImage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const serializedImages: SerializedGalleryImage[] = images.map((image) => ({
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

  const UNTITLED_KEY = "__untitled__";
  const projectMap = new Map<string, GalleryProjectOption>();
  for (const image of serializedImages) {
    const key = image.projectSlug ?? UNTITLED_KEY;
    if (!projectMap.has(key)) {
      projectMap.set(key, {
        slug: image.projectSlug,
        name: image.projectName ?? "Untitled project",
      });
    }
  }

  const projects = Array.from(projectMap.values()).sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );

  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };

  return (
    <AppPageLayout
      label="Gallery"
      user={user}
      actions={[
        {
          kind: "batch-upload",
          label: "Batch Upload",
          variant: "outline",
        },
      ]}
    >
      <GalleryView images={serializedImages} projects={projects} />
    </AppPageLayout>
  );
}

