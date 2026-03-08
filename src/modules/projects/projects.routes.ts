import { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/authMiddleware';
import {
  createProjectSchema,
  updateProjectSchema,
  projectParamsSchema,
  createTaskSchema,
  updateTaskSchema,
  taskParamsSchema,
} from './projects.schema';
import * as projectsService from './projects.service';
import type { AuthUserPayload } from '../../types/auth';

export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ─── Projects ───────────────────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const projects = await projectsService.listProjects(user.tenantId);
    return reply.send({ success: true, data: projects });
  });

  fastify.get('/:projectId', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { projectId } = projectParamsSchema.parse(request.params);
    const project = await projectsService.getProjectById(user.tenantId, projectId);
    return reply.send({ success: true, data: project });
  });

  fastify.post('/', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const body = createProjectSchema.parse(request.body);
    const project = await projectsService.createProject(user.tenantId, user.sub, body);
    return reply.code(201).send({ success: true, data: project });
  });

  fastify.patch('/:projectId', { preHandler: [requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN')] }, async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = updateProjectSchema.parse(request.body);
    const project = await projectsService.updateProject(user.tenantId, projectId, body);
    return reply.send({ success: true, data: project });
  });

  fastify.delete('/:projectId', { preHandler: [requireRole('ADMIN', 'SUPER_ADMIN')] }, async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { projectId } = projectParamsSchema.parse(request.params);
    await projectsService.deleteProject(user.tenantId, projectId);
    return reply.code(204).send();
  });

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  fastify.post('/:projectId/tasks', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = createTaskSchema.parse(request.body);
    const task = await projectsService.createTask(user.tenantId, projectId, body);
    return reply.code(201).send({ success: true, data: task });
  });

  fastify.patch('/:projectId/tasks/:taskId', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { projectId, taskId } = taskParamsSchema.parse(request.params);
    const body = updateTaskSchema.parse(request.body);
    const task = await projectsService.updateTask(user.tenantId, projectId, taskId, body);
    return reply.send({ success: true, data: task });
  });

  fastify.delete('/:projectId/tasks/:taskId', async (request, reply) => {
    const user = request.user as AuthUserPayload;
    const { projectId, taskId } = taskParamsSchema.parse(request.params);
    await projectsService.deleteTask(user.tenantId, projectId, taskId);
    return reply.code(204).send();
  });
}
