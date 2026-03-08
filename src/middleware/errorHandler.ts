import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export async function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Zod validation errors
  if (error instanceof ZodError) {
    const fields = error.flatten().fieldErrors;
    await reply.code(422).send({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields,
    });
    return;
  }

  // Application errors (expected)
  if (error instanceof AppError) {
    await reply.code(error.statusCode).send({
      success: false,
      error: error.message,
      code: error.code ?? 'APP_ERROR',
    });
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    await reply.code(401).send({
      success: false,
      error: 'Invalid or expired token',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  // Rate limit errors from @fastify/rate-limit
  if ((error as any).statusCode === 429) {
    await reply.code(429).send({
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });
    return;
  }

  // Unexpected errors — log but don't leak internals
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    method: request.method,
    url: request.url,
    requestId: request.id,
  });

  await reply.code(500).send({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
