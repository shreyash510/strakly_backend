import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Lookup Types data
const lookupTypes = [
  { code: 'USER_ROLE', name: 'User Role', description: 'Roles for user access control' },
  { code: 'USER_STATUS', name: 'User Status', description: 'Account status of users' },
  { code: 'GENDER', name: 'Gender', description: 'Gender options for user profile' },
  { code: 'DAY_OF_WEEK', name: 'Day of Week', description: 'Days of the week' },
];

async function seedUsers() {
  console.log('Seeding users...');

  const testUsers = [
    { name: 'Super Admin', email: 'superadmin@test.com', password: 'password123', role: UserRole.superadmin },
    { name: 'Admin User', email: 'admin@test.com', password: 'password123', role: UserRole.admin },
    { name: 'Manager User', email: 'manager@test.com', password: 'password123', role: UserRole.manager },
    { name: 'Trainer User', email: 'trainer@test.com', password: 'password123', role: UserRole.trainer },
    { name: 'Test User', email: 'user@test.com', password: 'password123', role: UserRole.user },
  ];

  for (const userData of testUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existingUser) {
      console.log(`  User ${userData.email} already exists, skipping...`);
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
    console.log(`  Created user: ${user.email} with role: ${user.role}`);
  }
}

async function seedLookupTypes() {
  console.log('Seeding lookup types...');

  for (const lookupType of lookupTypes) {
    const existing = await prisma.lookupType.findUnique({
      where: { code: lookupType.code },
    });

    if (existing) {
      console.log(`  LookupType ${lookupType.code} already exists, skipping...`);
      continue;
    }

    const created = await prisma.lookupType.create({
      data: lookupType,
    });
    console.log(`  Created LookupType: ${created.code}`);
  }
}

async function main() {
  console.log('Starting seed...\n');

  await seedUsers();
  console.log('');
  await seedLookupTypes();

  console.log('\nSeed completed!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
