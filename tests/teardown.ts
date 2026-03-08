import { prisma } from '../src/infrastructure/database/prisma';
import { redis } from '../src/infrastructure/redis/client';

export default async function globalTeardown() {
  await prisma.$disconnect();
  await redis.quit();
}
