import { prisma } from '../../infrastructure/database/prisma';
import { reportQueue } from '../../infrastructure/queues';
import { AppError } from '../../middleware/errorHandler';

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(tenantId: string) {
  return prisma.project.findMany({
    where: { tenantId },
    include: {
      _count: { select: { members: true, tasks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProjectById(tenantId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: {
      members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } } },
      tasks: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!project) throw new AppError('Project not found', 404);
  return project;
}

export async function createProject(
  tenantId: string,
  userId: string,
  data: { name: string; description?: string },
) {
  return prisma.project.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      members: {
        create: { userId, role: 'OWNER' },
      },
    },
    include: { members: true },
  });
}

export async function updateProject(
  tenantId: string,
  projectId: string,
  data: Record<string, unknown>,
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
  if (!project) throw new AppError('Project not found', 404);
  return prisma.project.update({ where: { id: projectId }, data });
}

export async function deleteProject(tenantId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
  if (!project) throw new AppError('Project not found', 404);
  await prisma.project.delete({ where: { id: projectId } });
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(
  tenantId: string,
  projectId: string,
  data: { title: string; description?: string; assigneeId?: string; priority?: string; dueDate?: string },
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId } });
  if (!project) throw new AppError('Project not found', 404);

  return prisma.task.create({
    data: {
      projectId,
      title: data.title,
      description: data.description,
      assigneeId: data.assigneeId,
      priority: (data.priority as any) ?? 'MEDIUM',
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    },
  });
}

export async function updateTask(
  tenantId: string,
  projectId: string,
  taskId: string,
  data: Record<string, unknown>,
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, project: { tenantId } },
  });
  if (!task) throw new AppError('Task not found', 404);

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate as string) : undefined },
  });

  // If a task is completed, queue a report update
  if (data.status === 'DONE') {
    await reportQueue.add('task-completed', {
      tenantId,
      projectId,
      taskId,
      completedAt: new Date().toISOString(),
    });
  }

  return updated;
}

export async function deleteTask(tenantId: string, projectId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, project: { tenantId } },
  });
  if (!task) throw new AppError('Task not found', 404);
  await prisma.task.delete({ where: { id: taskId } });
}
