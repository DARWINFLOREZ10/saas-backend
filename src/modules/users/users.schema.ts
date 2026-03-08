import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[!@#$%^&*]/),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
});

export const userParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).optional(),
  search: z.string().optional(),
});
