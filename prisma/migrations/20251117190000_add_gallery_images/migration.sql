-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "projectName" TEXT,
    "projectSlug" TEXT,
    "uploadUrl" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "aspectRatioId" TEXT,
    "aspectRatioString" TEXT,
    "metadata" JSONB,
    "cloudinaryPublicId" TEXT,
    "cloudinaryAssetId" TEXT,
    "cloudinaryFolder" TEXT,
    "cloudinaryVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryImage_userId_checksum_key" ON "GalleryImage"("userId", "checksum");

-- CreateIndex
CREATE INDEX "GalleryImage_userId_idx" ON "GalleryImage"("userId");

-- CreateIndex
CREATE INDEX "GalleryImage_jobId_idx" ON "GalleryImage"("jobId");

-- CreateIndex
CREATE INDEX "GalleryImage_userId_projectSlug_idx" ON "GalleryImage"("userId", "projectSlug");

-- AddForeignKey
ALTER TABLE "GalleryImage"
ADD CONSTRAINT "GalleryImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage"
ADD CONSTRAINT "GalleryImage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ThumbnailJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

