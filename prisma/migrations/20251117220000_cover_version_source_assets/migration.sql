-- AlterTable
ALTER TABLE "CoverVersion"
ADD COLUMN     "sourceImage1Url" TEXT,
ADD COLUMN     "sourceImage2Url" TEXT,
ADD COLUMN     "sourceImage3Url" TEXT,
ALTER COLUMN   "thumbnailJobId" DROP NOT NULL;

