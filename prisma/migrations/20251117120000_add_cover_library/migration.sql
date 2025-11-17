-- AlterTable
ALTER TABLE "ThumbnailJob"
ADD COLUMN     "projectName" TEXT,
ADD COLUMN     "projectSlug" TEXT;

-- CreateTable
CREATE TABLE "CoverProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "latestVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "thumbnailJobId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "selectedImageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoverProject_userId_slug_key" ON "CoverProject"("userId", "slug");

-- CreateIndex
CREATE INDEX "CoverProject_userId_updatedAt_idx" ON "CoverProject"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoverVersion_projectId_versionNumber_key" ON "CoverVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "CoverVersion_projectId_idx" ON "CoverVersion"("projectId");

-- AddForeignKey
ALTER TABLE "CoverProject" ADD CONSTRAINT "CoverProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverVersion" ADD CONSTRAINT "CoverVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CoverProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverVersion" ADD CONSTRAINT "CoverVersion_thumbnailJobId_fkey" FOREIGN KEY ("thumbnailJobId") REFERENCES "ThumbnailJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

