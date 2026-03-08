import { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/authMiddleware';
import { createTenantSchema, updateTenantSchema, tenantParamsSchema } from './tenants.schema';
import * as tenantsService from './tenants.service';
import type { AuthUserPayload } from '../../types/auth';

export async function tenantsRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /tenants — SUPER_ADMIN only
  fastify.get('/', { preHandler: [requireRole('SUPER_ADMIN')] }, async (_req, reply) => {
    const tenants = await tenantsService.getAllTenants();
    return reply.send({ success: true, data: tenants });
  });

  // GET /tenants/:tenantId — SUPER_ADMIN or member of that tenant
  fastify.get('/:tenantId', async (request, reply) => {
    const { tenantId } = tenantParamsSchema.parse(request.params);
    const user = request.user as AuthUserPayload;
    if (user.role !== 'SUPER_ADMIN' && user.tenantId !== tenantId) {
      return reply.code(403).send({ success: false, error: 'Forbidden' });
    }
    const tenant = await tenantsService.getTenantById(tenantId);
    return reply.send({ success: true, data: tenant });
  });

  // POST /tenants — SUPER_ADMIN only
  fastify.post('/', { preHandler: [requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    const body = createTenantSchema.parse(request.body);
    const tenant = await tenantsService.createTenant(body);
    return reply.code(201).send({ success: true, data: tenant });
  });

  // PATCH /tenants/:tenantId — SUPER_ADMIN only
  fastify.patch('/:tenantId', { preHandler: [requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    const { tenantId } = tenantParamsSchema.parse(request.params);
    const body = updateTenantSchema.parse(request.body);
    const tenant = await tenantsService.updateTenant(tenantId, body);
    return reply.send({ success: true, data: tenant });
  });

  // DELETE /tenants/:tenantId — SUPER_ADMIN only
  fastify.delete('/:tenantId', { preHandler: [requireRole('SUPER_ADMIN')] }, async (request, reply) => {
    const { tenantId } = tenantParamsSchema.parse(request.params);
    await tenantsService.deleteTenant(tenantId);
    return reply.code(204).send();
  });
}
