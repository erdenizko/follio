-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThumbnailJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "aspectRatioId" TEXT NOT NULL,
    "aspectRatioString" TEXT NOT NULL,
    "customWidth" INTEGER,
    "customHeight" INTEGER,
    "inputBackgroundImage" JSONB NOT NULL,
    "inputMascotImage" JSONB,
    "inputLogoImage" JSONB,
    "inputImagesMetadata" JSONB NOT NULL,
    "falRequestId" TEXT,
    "falResultUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThumbnailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "requestPayloadSummary" JSONB NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "aspectRatioId" TEXT,
    "modelId" TEXT,
    "inputImageCount" INTEGER,
    "falRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ThumbnailJob" ADD CONSTRAINT "ThumbnailJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
