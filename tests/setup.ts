import { execSync } from 'child_process';

export default async function globalSetup() {
  process.env.DATABASE_URL = 'postgresql://saas_user:saas_pass@localhost:5432/saas_test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars-long!!';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';

  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env } });
  } catch {
    console.warn('Migration failed — test DB may already be up to date');
  }
}
