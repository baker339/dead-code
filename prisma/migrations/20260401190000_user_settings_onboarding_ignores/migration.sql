-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "onboardingDismissedAt" TIMESTAMP(3),
ADD COLUMN "pathIgnoreGlobs" JSONB NOT NULL DEFAULT '[]'::jsonb;
