import { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import * as authService from './auth.service';
import { authenticate } from '../../middleware/authMiddleware';

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const tokens = await authService.register(body, fastify.jwt.sign.bind(fastify.jwt));
    return reply.code(201).send({ success: true, data: tokens });
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const tokens = await authService.login(body, fastify.jwt.sign.bind(fastify.jwt));
    return reply.send({ success: true, data: tokens });
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const tokens = await authService.refresh(refreshToken, fastify.jwt.sign.bind(fastify.jwt));
    return reply.send({ success: true, data: tokens });
  });

  // POST /auth/logout
  fastify.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    await authService.logout(refreshToken);
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  // GET /auth/me
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send({ success: true, data: request.user });
  });
}
