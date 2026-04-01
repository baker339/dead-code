import { prisma } from "@/lib/db";

export async function getOrCreateUserSettings(userId: string) {
  const existing = await prisma.userSettings.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  return prisma.userSettings.create({
    data: { userId },
  });
}
