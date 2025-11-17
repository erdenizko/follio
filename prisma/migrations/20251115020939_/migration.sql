/*
  Warnings:

  - You are about to drop the column `inputBackgroundImage` on the `ThumbnailJob` table. All the data in the column will be lost.
  - You are about to drop the column `inputLogoImage` on the `ThumbnailJob` table. All the data in the column will be lost.
  - You are about to drop the column `inputMascotImage` on the `ThumbnailJob` table. All the data in the column will be lost.
  - Added the required column `inputImage1` to the `ThumbnailJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inputImage2` to the `ThumbnailJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inputImage3` to the `ThumbnailJob` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ThumbnailJob" DROP COLUMN "inputBackgroundImage",
DROP COLUMN "inputLogoImage",
DROP COLUMN "inputMascotImage",
ADD COLUMN     "inputImage1" JSONB NOT NULL,
ADD COLUMN     "inputImage2" JSONB NOT NULL,
ADD COLUMN     "inputImage3" JSONB NOT NULL;
