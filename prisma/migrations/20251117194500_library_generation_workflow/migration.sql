-- CreateEnum
CREATE TYPE "LibraryGenerationStatus" AS ENUM ('WAITING', 'GENERATING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "CoverProject"
ADD COLUMN     "librarySelected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "libraryGenerationStatus" "LibraryGenerationStatus" NOT NULL DEFAULT 'WAITING',
ADD COLUMN     "libraryGenerationJobId" TEXT,
ADD COLUMN     "libraryGenerationQueuedAt" TIMESTAMP(3),
ADD COLUMN     "libraryGenerationCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GalleryImage"
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "isSourceAsset" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "GalleryImage_projectId_idx" ON "GalleryImage"("projectId");

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CoverProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

