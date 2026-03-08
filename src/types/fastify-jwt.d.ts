import '@fastify/jwt';
import type { AuthUserPayload } from './auth';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUserPayload;
    user: AuthUserPayload;
  }
}
