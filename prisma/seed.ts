import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log('Starting seed...');

  // Create test users with different roles
  const testUsers = [
    {
      name: 'Super Admin',
      email: 'superadmin@test.com',
      password: 'password123',
      role: UserRole.superadmin,
    },
    {
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: UserRole.admin,
    },
    {
      name: 'Manager User',
      email: 'manager@test.com',
      password: 'password123',
      role: UserRole.manager,
    },
    {
      name: 'Trainer User',
      email: 'trainer@test.com',
      password: 'password123',
      role: UserRole.trainer,
    },
    {
      name: 'Test User',
      email: 'user@test.com',
      password: 'password123',
      role: UserRole.user,
    },
  ];

  for (const userData of testUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existingUser) {
      console.log(`User ${userData.email} already exists, skipping...`);
      continue;
    }

    const passwordHash = await hashPassword(userData.password);

    const user = await prisma.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        status: UserStatus.active,
      },
    });

    console.log(`Created user: ${user.email} with role: ${user.role}`);
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
