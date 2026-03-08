import bcrypt from 'bcryptjs';
import { prisma } from '../../infrastructure/database/prisma';
import { redis, buildCacheKey } from '../../infrastructure/redis/client';
import { AppError } from '../../middleware/errorHandler';
import { revokeAllUserTokens } from '../auth/auth.service';

const omitPassword = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

export async function listUsers(
  tenantId: string,
  query: { page: number; limit: number; role?: string; search?: string },
) {
  const { page, limit, role, search } = query;
  const skip = (page - 1) * limit;

  const where: any = { tenantId };
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: omitPassword, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getUserById(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: omitPassword,
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

export async function createUser(
  tenantId: string,
  data: { email: string; password: string; firstName: string; lastName: string; role?: string },
) {
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email: data.email } },
  });
  if (existing) throw new AppError('Email already in use', 409);

  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.user.create({
    data: { tenantId, email: data.email, passwordHash, firstName: data.firstName, lastName: data.lastName, role: (data.role as any) ?? 'MEMBER' },
    select: omitPassword,
  });
}

export async function updateUser(tenantId: string, userId: string, data: Record<string, unknown>) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new AppError('User not found', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: omitPassword,
  });

  // If deactivated, revoke all sessions
  if (data.isActive === false) {
    await revokeAllUserTokens(userId);
  }

  await redis.del(buildCacheKey('user', userId));
  return updated;
}

export async function deleteUser(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) throw new AppError('User not found', 404);

  await revokeAllUserTokens(userId);
  await prisma.user.delete({ where: { id: userId } });
  await redis.del(buildCacheKey('user', userId));
}
