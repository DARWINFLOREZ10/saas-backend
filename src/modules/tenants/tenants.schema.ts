import { z } from 'zod';

// ─── Tenant Schemas ───────────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  plan: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
  isActive: z.boolean().optional(),
});

export const tenantParamsSchema = z.object({
  tenantId: z.string().uuid(),
});
