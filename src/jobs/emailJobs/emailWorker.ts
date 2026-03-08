import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { bullMQConnection } from '../../infrastructure/queues';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

// ─── Mailer setup ─────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

// ─── Job handlers ─────────────────────────────────────────────────────────────

interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, string>;
}

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, template, data } = job.data;

  logger.debug('Processing email job', { jobId: job.id, template, to });

  const html = buildEmailHtml(template, data);

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html,
  });

  logger.info('Email sent', { to, subject, jobId: job.id });
}

// Simple template renderer (replace with Handlebars/Mjml in production)
function buildEmailHtml(template: string, data: Record<string, string>): string {
  const templates: Record<string, (d: Record<string, string>) => string> = {
    welcome: (d) => `
      <h1>Welcome, ${d.firstName}!</h1>
      <p>Your account at <strong>${d.tenantName}</strong> is ready.</p>
      <p>Get started by logging into your dashboard.</p>
    `,
    'password-reset': (d) => `
      <h1>Password Reset</h1>
      <p>Click the link below to reset your password (expires in 1 hour):</p>
      <a href="${d.resetLink}">${d.resetLink}</a>
    `,
  };

  const builder = templates[template];
  if (!builder) {
    return `<p>${JSON.stringify(data)}</p>`;
  }
  return builder(data);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startEmailWorker(): Worker {
  const worker = new Worker(env.QUEUE_EMAIL, processEmailJob, {
    connection: bullMQConnection,
    concurrency: 5,
  });

  worker.on('completed', (job) => logger.debug('Email worker completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('Email worker failed', { jobId: job?.id, error: err.message }),
  );
  worker.on('error', (err) => logger.error('Email worker error', { error: err.message }));

  logger.info('Email worker started');
  return worker;
}
