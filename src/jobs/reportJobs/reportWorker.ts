import { Worker, Job } from 'bullmq';
import { bullMQConnection } from '../../infrastructure/queues';
import { prisma } from '../../infrastructure/database/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

// ─── Job data types ───────────────────────────────────────────────────────────

interface TaskCompletedData {
  tenantId: string;
  projectId: string;
  taskId: string;
  completedAt: string;
}

interface GenerateReportData {
  tenantId: string;
  projectId?: string;
  type: 'project-summary' | 'tenant-activity';
  requestedBy: string;
}

// ─── Processors ──────────────────────────────────────────────────────────────

async function processReportJob(job: Job<TaskCompletedData | GenerateReportData>): Promise<object> {
  switch (job.name) {
    case 'task-completed':
      return handleTaskCompleted(job as Job<TaskCompletedData>);
    case 'generate-report':
      return handleGenerateReport(job as Job<GenerateReportData>);
    default:
      logger.warn('Unknown report job type', { name: job.name });
      return {};
  }
}

async function handleTaskCompleted(job: Job<TaskCompletedData>): Promise<object> {
  const { tenantId, projectId } = job.data;

  const [total, done] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: 'DONE' } }),
  ]);

  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  logger.info('Task completion report', { tenantId, projectId, completionRate, total, done });

  // Auto-complete project if all tasks are done
  if (completionRate === 100) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'COMPLETED' },
    });
    logger.info('Project auto-completed', { projectId });
  }

  return { completionRate, total, done };
}

async function handleGenerateReport(job: Job<GenerateReportData>): Promise<object> {
  const { tenantId, projectId, type } = job.data;

  if (type === 'project-summary' && projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        members: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!project) return { error: 'Project not found' };

    const tasksByStatus = project.tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { projectName: project.name, tasksByStatus, memberCount: project.members.length };
  }

  if (type === 'tenant-activity') {
    const [userCount, projectCount, taskCount] = await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.project.count({ where: { tenantId } }),
      prisma.task.count({ where: { project: { tenantId } } }),
    ]);
    return { userCount, projectCount, taskCount };
  }

  return {};
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startReportWorker(): Worker {
  const worker = new Worker(env.QUEUE_REPORT, processReportJob, {
    connection: bullMQConnection,
    concurrency: 2,
  });

  worker.on('completed', (job, result) =>
    logger.debug('Report job completed', { jobId: job.id, result }),
  );
  worker.on('failed', (job, err) =>
    logger.error('Report job failed', { jobId: job?.id, error: err.message }),
  );
  worker.on('error', (err) => logger.error('Report worker error', { error: err.message }));

  logger.info('Report worker started');
  return worker;
}
