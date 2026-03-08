import { Queue, QueueEvents } from 'bullmq';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
};

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const emailQueue = new Queue(env.QUEUE_EMAIL, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const reportQueue = new Queue(env.QUEUE_REPORT, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  },
});

// ─── Queue Events (monitoring) ────────────────────────────────────────────────

const emailEvents = new QueueEvents(env.QUEUE_EMAIL, { connection });
emailEvents.on('completed', ({ jobId }) => logger.debug('Email job completed', { jobId }));
emailEvents.on('failed', ({ jobId, failedReason }) =>
  logger.error('Email job failed', { jobId, reason: failedReason }),
);

const reportEvents = new QueueEvents(env.QUEUE_REPORT, { connection });
reportEvents.on('completed', ({ jobId }) => logger.debug('Report job completed', { jobId }));
reportEvents.on('failed', ({ jobId, failedReason }) =>
  logger.error('Report job failed', { jobId, reason: failedReason }),
);

// ─── Queue health helper ──────────────────────────────────────────────────────

export async function getQueuesHealth() {
  const [emailCounts, reportCounts] = await Promise.all([
    emailQueue.getJobCounts(),
    reportQueue.getJobCounts(),
  ]);
  return { email: emailCounts, report: reportCounts };
}

export { connection as bullMQConnection };
