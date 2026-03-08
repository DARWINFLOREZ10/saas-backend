/// <reference types="jest" />

import { beforeAll, afterAll, beforeEach, describe, it, expect } from '@jest/globals';
import { buildApp } from '../src/app';
import { prisma } from '../src/infrastructure/database/prisma';
import { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Clean test data in correct order (FK constraints)
  await prisma.refreshToken.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin() {
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      tenantSlug: 'test-corp',
      email: 'admin@test.com',
      password: 'Admin123!',
      firstName: 'Admin',
      lastName: 'Test',
    },
  });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug: 'test-corp', email: 'admin@test.com', password: 'Admin123!' },
  });

  return JSON.parse(loginRes.body).data as { accessToken: string; refreshToken: string };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Health Check', () => {
  it('GET /health returns 200 or 503', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect([200, 503]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('services');
  });
});

describe('Auth — Register', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        tenantSlug: 'my-company',
        email: 'user@my-company.com',
        password: 'Pass123!',
        firstName: 'John',
        lastName: 'Doe',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
  });

  it('returns 422 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { tenantSlug: 'my-co', email: 'not-an-email', password: 'Pass123!', firstName: 'X', lastName: 'Y' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 409 for duplicate email', async () => {
    const payload = {
      tenantSlug: 'dup-co',
      email: 'dup@test.com',
      password: 'Pass123!',
      firstName: 'A',
      lastName: 'B',
    };
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    expect(res.statusCode).toBe(409);
  });
});

describe('Auth — Login', () => {
  it('returns tokens with valid credentials', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { tenantSlug: 'login-co', email: 'u@login-co.com', password: 'Pass123!', firstName: 'A', lastName: 'B' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantSlug: 'login-co', email: 'u@login-co.com', password: 'Pass123!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('accessToken');
  });

  it('returns 401 with wrong password', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { tenantSlug: 'bad-login', email: 'u@bad.com', password: 'Pass123!', firstName: 'A', lastName: 'B' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantSlug: 'bad-login', email: 'u@bad.com', password: 'WrongPass1!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — Token Refresh', () => {
  it('returns new token pair on valid refresh token', async () => {
    const { refreshToken } = await registerAndLogin();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
  });

  it('rejects reused refresh token (rotation)', async () => {
    const { refreshToken } = await registerAndLogin();

    // Use it once
    await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });

    // Reuse should fail
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — Protected Routes', () => {
  it('returns 401 on /auth/me without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns user info on /auth/me with valid token', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Projects', () => {
  it('creates a project and lists it', async () => {
    const { accessToken } = await registerAndLogin();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Test Project', description: 'A test' },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const { data } = JSON.parse(listRes.body);
    expect(data.length).toBe(1);
    expect(data[0].name).toBe('Test Project');
  });
});
