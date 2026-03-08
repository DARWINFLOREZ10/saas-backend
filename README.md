# SaaS Backend

Production-grade multi-tenant SaaS backend built with **Fastify**, **TypeScript**, **PostgreSQL**, **Redis**, and **BullMQ**.

## Architecture

```
Client
  │
  ├── Rate Limiter (@fastify/rate-limit + Redis)
  │
  ├── API Gateway (Fastify)
  │      ├── /api/v1/auth       → Authentication (JWT + refresh token rotation)
  │      ├── /api/v1/tenants    → Tenant management (multi-tenant isolation)
  │      ├── /api/v1/users      → User management (RBAC)
  │      └── /api/v1/projects   → Projects + Tasks
  │
  ├── Background Workers (BullMQ)
  │      ├── Email Worker       → Welcome emails, password reset
  │      └── Report Worker      → Task completion, project summaries
  │
  ├── Redis                     → Rate limiting + session cache + job queues
  └── PostgreSQL                → Primary data store (Prisma ORM)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript 5 |
| Web Framework | Fastify 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Cache / Queue store | Redis 7 |
| Job Queues | BullMQ |
| Validation | Zod |
| Auth | JWT + bcrypt |
| Logging | Winston |
| Documentation | Swagger / OpenAPI |
| Testing | Jest + Fastify inject |
| Containerization | Docker + Docker Compose |

## Features

- **Multi-tenant architecture** — tenant isolation via `tenantId` on every model; unique emails per tenant
- **Authentication** — JWT access tokens (15 min) + refresh token rotation (7 days), bcrypt hashed passwords
- **RBAC** — `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `MEMBER`, `VIEWER` roles
- **Background jobs** — BullMQ workers for email delivery and report generation with retry/backoff
- **Redis caching** — cache-aside pattern for tenants and users; session revocation blacklist
- **Rate limiting** — per-IP rate limiting backed by Redis
- **Health checks** — `/health` endpoint reporting DB, Redis, and queue status
- **Graceful shutdown** — clean close of server, workers, DB, and Redis on SIGTERM
- **Swagger docs** — auto-generated at `/docs`

## Quick Start

### With Docker (recommended)

```bash
# Copy env file
cp .env.example .env

# Start everything (DB + Redis + Mailhog + API)
docker compose up --build

# Run migrations (first time)
docker compose run --rm migrate

# Seed demo data
docker compose exec api npx ts-node prisma/seed.ts
```

### Local Development

```bash
# Install dependencies
npm install

# Copy and configure env
cp .env.example .env

# Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# Seed demo data
npm run prisma:seed

# Start dev server (hot reload)
npm run dev
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/register | — | Register (creates tenant + first user) |
| POST | /api/v1/auth/login | — | Login |
| POST | /api/v1/auth/refresh | — | Rotate refresh token |
| POST | /api/v1/auth/logout | ✓ | Revoke refresh token |
| GET | /api/v1/auth/me | ✓ | Current user info |
| GET | /api/v1/tenants | SUPER_ADMIN | List all tenants |
| POST | /api/v1/tenants | SUPER_ADMIN | Create tenant |
| GET | /api/v1/tenants/:id | ✓ | Get tenant |
| PATCH | /api/v1/tenants/:id | SUPER_ADMIN | Update tenant |
| DELETE | /api/v1/tenants/:id | SUPER_ADMIN | Delete tenant |
| GET | /api/v1/users | ADMIN+ | List tenant users |
| POST | /api/v1/users | ADMIN | Create user |
| GET | /api/v1/users/:id | ✓ | Get user |
| PATCH | /api/v1/users/:id | ADMIN/self | Update user |
| DELETE | /api/v1/users/:id | ADMIN | Delete user |
| GET | /api/v1/projects | ✓ | List projects |
| POST | /api/v1/projects | ✓ | Create project |
| GET | /api/v1/projects/:id | ✓ | Get project + tasks |
| PATCH | /api/v1/projects/:id | MANAGER+ | Update project |
| DELETE | /api/v1/projects/:id | ADMIN | Delete project |
| POST | /api/v1/projects/:id/tasks | ✓ | Create task |
| PATCH | /api/v1/projects/:id/tasks/:tid | ✓ | Update task |
| DELETE | /api/v1/projects/:id/tasks/:tid | ✓ | Delete task |
| GET | /health | — | Health check |
| GET | /docs | — | Swagger UI |

## Demo Credentials (after seed)

```
Tenant:    acme-corp
Admin:     admin@acme.com  / Admin123!
Member:    member@acme.com / Member123!
```

## Running Tests

```bash
npm test
```

Tests use Fastify's built-in `inject()` — no HTTP server needed. Each test cleans the DB.

## Environment Variables

See `.env.example` for all available variables and their defaults.

## Project Structure

```
src/
├── config/           # env validation, logger
├── infrastructure/
│   ├── database/     # Prisma singleton
│   ├── redis/        # Redis client + cache helpers
│   └── queues/       # BullMQ queue definitions
├── middleware/       # authMiddleware, errorHandler
├── modules/
│   ├── auth/         # register, login, refresh, logout
│   ├── tenants/      # tenant CRUD
│   ├── users/        # user CRUD + role management
│   └── projects/     # projects + tasks
├── jobs/
│   ├── emailJobs/    # email BullMQ worker
│   └── reportJobs/   # report BullMQ worker
├── app.ts            # Fastify app factory
└── server.ts         # entry point + graceful shutdown
prisma/
├── schema.prisma     # DB schema (multi-tenant)
└── seed.ts           # demo data
tests/
└── auth.test.ts      # integration tests
```
