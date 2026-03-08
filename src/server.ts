import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './infrastructure/database/prisma';
import { redis } from './infrastructure/redis/client';
import { startEmailWorker } from './jobs/emailJobs/emailWorker';
import { startReportWorker } from './jobs/reportJobs/reportWorker';

async function start() {
  const app = await buildApp();

  // Start background workers
  const emailWorker = startEmailWorker();
  const reportWorker = startReportWorker();

  // Start server
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`🚀 Server running on http://${env.HOST}:${env.PORT}`);
  logger.info(`📖 Swagger docs at http://${env.HOST}:${env.PORT}/docs`);

  // ─── Graceful Shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    await app.close();
    await emailWorker.close();
    await reportWorker.close();
    await prisma.$disconnect();
    await redis.quit();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
