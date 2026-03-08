import { PrismaClient, Role, Plan } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: Plan.PROFESSIONAL,
    },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@acme.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@acme.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
    },
  });

  // Create member user
  const memberHash = await bcrypt.hash('Member123!', 12);
  const member = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'member@acme.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'member@acme.com',
      passwordHash: memberHash,
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.MEMBER,
    },
  });

  // Create demo project
  const project = await prisma.project.create({
    data: {
      tenantId: tenant.id,
      name: 'Website Redesign',
      description: 'Complete overhaul of the company website',
      members: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: member.id, role: 'EDITOR' },
        ],
      },
      tasks: {
        create: [
          { title: 'Design wireframes', assigneeId: member.id, status: 'IN_PROGRESS', priority: 'HIGH' },
          { title: 'Set up CI/CD', assigneeId: admin.id, status: 'TODO', priority: 'MEDIUM' },
        ],
      },
    },
  });

  console.log('✅ Seed complete:', { tenant: tenant.slug, admin: admin.email, project: project.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
