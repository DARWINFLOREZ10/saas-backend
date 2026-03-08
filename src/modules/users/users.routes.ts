import { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/authMiddleware';
import { createUserSchema, updateUserSchema, userParamsSchema, listUsersQuerySchema } from './users.schema';
import * as usersService from './users.service';
import type { AuthUserPayload } from '../../types/auth';

export async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET /users — list users in current tenant
  fastify.get('/', { preHandler: [requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN')] }, async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const query = listUsersQuerySchema.parse(request.query);
    const result = await usersService.listUsers(user.tenantId, query);
    return reply.send({ success: true, ...result });
  });

  // GET /users/:userId
  fastify.get('/:userId', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { userId } = userParamsSchema.parse(request.params);
    // Members can only see themselves
    if (user.role === 'MEMBER' && user.sub !== userId) {
      return reply.code(403).send({ success: false, error: 'Forbidden' });
    }
    const userData = await usersService.getUserById(user.tenantId, userId);
    return reply.send({ success: true, data: userData });
  });

  // POST /users — ADMIN only
  fastify.post('/', { preHandler: [requireRole('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const body = createUserSchema.parse(request.body);
    const userData = await usersService.createUser(user.tenantId, body);
    return reply.code(201).send({ success: true, data: userData });
  });

  // PATCH /users/:userId — ADMIN or self
  fastify.patch('/:userId', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { userId } = userParamsSchema.parse(request.params);
    const isSelf = user.sub === userId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
    if (!isSelf && !isAdmin) {
      return reply.code(403).send({ success: false, error: 'Forbidden' });
    }
    const body = updateUserSchema.parse(request.body);
    // Only admins can change roles or deactivate
    if ((body.role !== undefined || body.isActive !== undefined) && !isAdmin) {
      return reply.code(403).send({ success: false, error: 'Only admins can change role or status' });
    }
    const userData = await usersService.updateUser(user.tenantId, userId, body);
    return reply.send({ success: true, data: userData });
  });

  // DELETE /users/:userId — ADMIN only
  fastify.delete('/:userId', { preHandler: [requireRole('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { userId } = userParamsSchema.parse(request.params);
    await usersService.deleteUser(user.tenantId, userId);
    return reply.code(204).send();
  });
}
