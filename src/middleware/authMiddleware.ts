import { FastifyRequest, FastifyReply } from 'fastify';
import { redis, buildCacheKey } from '../infrastructure/redis/client';
import { AppError } from './errorHandler';
import type { AuthUserPayload } from '../types/auth';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();

    const payload = request.user as AuthUserPayload;

    // Check if all user tokens were revoked (e.g., password change, account suspension)
    const isRevoked = await redis.get(buildCacheKey('revoked_user', payload.sub));
    if (isRevoked) {
      throw new AppError('Session revoked', 401);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Unauthorized', 401);
  }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as AuthUserPayload;
    if (!user || !roles.includes(user.role)) {
      throw new AppError(`Requires one of roles: ${roles.join(', ')}`, 403);
    }
  };
}
