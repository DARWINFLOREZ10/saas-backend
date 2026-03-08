import { execSync } from 'child_process';

export default async function globalSetup() {
  const inDocker = process.env.TEST_IN_DOCKER === '1';
  const postgresHost = inDocker ? 'postgres' : '127.0.0.1';
  const redisHost = inDocker ? 'redis' : '127.0.0.1';

  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    `postgresql://saas_user:saas_pass@${postgresHost}:5432/saas_db?schema=saas_test`;
  process.env.REDIS_HOST = process.env.TEST_REDIS_HOST ?? redisHost;
  process.env.REDIS_PORT = '6379';
  process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long!!';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';

  try {
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env: { ...process.env } });
  } catch {
    console.warn('Test DB sync failed — continuing');
  }
}
