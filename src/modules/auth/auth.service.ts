import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../infrastructure/database/prisma';
import { redis, buildCacheKey } from '../../infrastructure/redis/client';
import { emailQueue } from '../../infrastructure/queues';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  tenantSlug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  tenantSlug: string;
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type JwtSigner = (payload: any, options?: any) => string;

// ─── Service ──────────────────────────────────────────────────────────────────

export async function register(input: RegisterInput, signJwt: JwtSigner): Promise<TokenPair> {
  let tenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug } });

  // Onboarding flow: if tenant does not exist, create it automatically.
  if (!tenant) {
    const humanName = input.tenantSlug
      .split('-')
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');

    tenant = await prisma.tenant.create({
      data: {
        slug: input.tenantSlug,
        name: humanName || input.tenantSlug,
      },
    });
  }

  if (!tenant.isActive) {
    throw new AppError('Tenant not found or inactive', 404);
  }

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: input.email } },
  });
  if (existing) {
    throw new AppError('Email already in use', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });

  // Queue welcome email
  await emailQueue.add('welcome', {
    to: user.email,
    subject: `Welcome to ${tenant.name}!`,
    template: 'welcome',
    data: { firstName: user.firstName, tenantName: tenant.name },
  });

  return issueTokenPair(user.id, tenant.id, user.role, user.email, signJwt);
}

export async function login(input: LoginInput, signJwt: JwtSigner): Promise<TokenPair> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug } });
  if (!tenant || !tenant.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: input.email } },
  });

  if (!user || !user.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return issueTokenPair(user.id, tenant.id, user.role, user.email, signJwt);
}

export async function refresh(
  token: string,
  signJwt: JwtSigner,
): Promise<TokenPair> {
  const tokenHash = hashToken(token);

  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(
    storedToken.userId,
    storedToken.tenantId,
    storedToken.user.role,
    storedToken.user.email,
    signJwt,
  );
}

export async function logout(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // Blacklist active sessions in Redis
  await redis.set(buildCacheKey('revoked_user', userId), '1', 'EX', 7 * 24 * 60 * 60);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokenPair(
  userId: string,
  tenantId: string,
  role: string,
  email: string,
  signJwt: JwtSigner,
): Promise<TokenPair> {
  const accessToken = signJwt(
    { sub: userId, tenantId, role, email },
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  );

  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { userId, tenantId, tokenHash, expiresAt },
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
