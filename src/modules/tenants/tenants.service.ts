import { prisma } from '../../infrastructure/database/prisma';
import { redis, buildCacheKey } from '../../infrastructure/redis/client';
import { AppError } from '../../middleware/errorHandler';

const TENANT_CACHE_TTL = 300; // 5 minutes

export async function getAllTenants() {
  return prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, plan: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTenantById(tenantId: string) {
  const cacheKey = buildCacheKey('tenant', tenantId);
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { _count: { select: { users: true, projects: true } } },
  });

  if (!tenant) throw new AppError('Tenant not found', 404);

  await redis.set(cacheKey, JSON.stringify(tenant), 'EX', TENANT_CACHE_TTL);
  return tenant;
}

export async function createTenant(data: { name: string; slug: string; plan?: string }) {
  const existing = await prisma.tenant.findUnique({ where: { slug: data.slug } });
  if (existing) throw new AppError('Slug already taken', 409);

  return prisma.tenant.create({ data: data as any });
}

export async function updateTenant(tenantId: string, data: Record<string, unknown>) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError('Tenant not found', 404);

  const updated = await prisma.tenant.update({ where: { id: tenantId }, data });

  // Invalidate cache
  await redis.del(buildCacheKey('tenant', tenantId));

  return updated;
}

export async function deleteTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError('Tenant not found', 404);

  await prisma.tenant.delete({ where: { id: tenantId } });
  await redis.del(buildCacheKey('tenant', tenantId));
}
