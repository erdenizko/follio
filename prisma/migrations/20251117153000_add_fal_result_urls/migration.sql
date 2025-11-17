-- Add array of Fal-generated result URLs per job
ALTER TABLE "ThumbnailJob"
ADD COLUMN "falResultUrls" JSONB;

