import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { redis } from './infrastructure/redis/client';
import { checkDatabaseConnection } from './infrastructure/database/prisma';
import { getQueuesHealth } from './infrastructure/queues';

import { authRoutes } from './modules/auth/auth.routes';
import { tenantsRoutes } from './modules/tenants/tenants.routes';
import { usersRoutes } from './modules/users/users.routes';
import { projectsRoutes } from './modules/projects/projects.routes';

export async function buildApp() {
  const app = Fastify({
    logger: false, // we use Winston
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  // ─── Security ──────────────────────────────────────────────────────────────
  await app.register(fastifyHelmet, { contentSecurityPolicy: env.NODE_ENV === 'production' });
  await app.register(fastifyCors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Rate Limiting ─────────────────────────────────────────────────────────
  await app.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
    keyGenerator: (request) =>
      request.headers['x-forwarded-for']?.toString() ?? request.ip,
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    }),
  });

  // ─── JWT ───────────────────────────────────────────────────────────────────
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });

  // ─── Swagger / OpenAPI ────────────────────────────────────────────────────
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'SaaS Backend API',
        description: 'Production-grade multi-tenant SaaS API',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' });

  // ─── Error Handler ─────────────────────────────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ─── Request logging ───────────────────────────────────────────────────────
  app.addHook('onRequest', (request, _reply, done) => {
    logger.info('Incoming request', { method: request.method, url: request.url, id: request.id });
    done();
  });

  // ─── Health Check ──────────────────────────────────────────────────────────
  app.get('/health', {
    config: { rateLimit: { max: 300 } }, // higher limit for health probes
  }, async (_request, reply) => {
    const [dbOk, redisOk, queueStats] = await Promise.all([
      checkDatabaseConnection(),
      redis.ping().then(() => true).catch(() => false),
      getQueuesHealth(),
    ]);

    const status = dbOk && redisOk ? 'ok' : 'degraded';
    const code = status === 'ok' ? 200 : 503;

    return reply.code(code).send({
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
        queues: queueStats,
      },
    });
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  const apiPrefix = '/api/v1';
  await app.register(authRoutes, { prefix: `${apiPrefix}/auth` });
  await app.register(tenantsRoutes, { prefix: `${apiPrefix}/tenants` });
  await app.register(usersRoutes, { prefix: `${apiPrefix}/users` });
  await app.register(projectsRoutes, { prefix: `${apiPrefix}/projects` });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
  });

  return app;
}
