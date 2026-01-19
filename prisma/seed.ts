import { PrismaClient } from '@prisma/client';
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

// Lookup values for each type
const lookupValues: Record<string, Array<{ code: string; name: string; value?: string; displayOrder: number }>> = {
  USER_ROLE: [
    { code: 'superadmin', name: 'Super Admin', value: 'superadmin', displayOrder: 1 },
    { code: 'admin', name: 'Admin', value: 'admin', displayOrder: 2 },
    { code: 'manager', name: 'Manager', value: 'manager', displayOrder: 3 },
    { code: 'trainer', name: 'Trainer', value: 'trainer', displayOrder: 4 },
    { code: 'user', name: 'User', value: 'user', displayOrder: 5 },
  ],
  USER_STATUS: [
    { code: 'active', name: 'Active', value: 'active', displayOrder: 1 },
    { code: 'inactive', name: 'Inactive', value: 'inactive', displayOrder: 2 },
    { code: 'suspended', name: 'Suspended', value: 'suspended', displayOrder: 3 },
  ],
  GENDER: [
    { code: 'male', name: 'Male', value: 'male', displayOrder: 1 },
    { code: 'female', name: 'Female', value: 'female', displayOrder: 2 },
    { code: 'other', name: 'Other', value: 'other', displayOrder: 3 },
  ],
  DAY_OF_WEEK: [
    { code: 'sunday', name: 'Sunday', value: '0', displayOrder: 0 },
    { code: 'monday', name: 'Monday', value: '1', displayOrder: 1 },
    { code: 'tuesday', name: 'Tuesday', value: '2', displayOrder: 2 },
    { code: 'wednesday', name: 'Wednesday', value: '3', displayOrder: 3 },
    { code: 'thursday', name: 'Thursday', value: '4', displayOrder: 4 },
    { code: 'friday', name: 'Friday', value: '5', displayOrder: 5 },
    { code: 'saturday', name: 'Saturday', value: '6', displayOrder: 6 },
  ],
};

// Permissions data
const permissions = [
  // Users module
  { code: 'users.create', name: 'Create Users', module: 'users', description: 'Create new users' },
  { code: 'users.read', name: 'Read Users', module: 'users', description: 'View user list and details' },
  { code: 'users.update', name: 'Update Users', module: 'users', description: 'Edit user information' },
  { code: 'users.delete', name: 'Delete Users', module: 'users', description: 'Delete users' },
  // Attendance module
  { code: 'attendance.mark', name: 'Mark Attendance', module: 'attendance', description: 'Mark check-in/out' },
  { code: 'attendance.read', name: 'Read Attendance', module: 'attendance', description: 'View attendance records' },
  { code: 'attendance.manage', name: 'Manage Attendance', module: 'attendance', description: 'Edit/delete attendance records' },
  // Lookups module
  { code: 'lookups.create', name: 'Create Lookups', module: 'lookups', description: 'Create lookup values' },
  { code: 'lookups.read', name: 'Read Lookups', module: 'lookups', description: 'View lookup values' },
  { code: 'lookups.update', name: 'Update Lookups', module: 'lookups', description: 'Edit lookup values' },
  { code: 'lookups.delete', name: 'Delete Lookups', module: 'lookups', description: 'Delete lookup values' },
  // Settings/Admin module
  { code: 'settings.manage', name: 'Manage Settings', module: 'settings', description: 'Manage system settings' },
  { code: 'permissions.manage', name: 'Manage Permissions', module: 'permissions', description: 'Manage role permissions' },
];

// Role permissions mapping - which permissions each role has
const rolePermissions: Record<string, string[]> = {
  superadmin: permissions.map(p => p.code), // All permissions
  admin: [
    'users.create', 'users.read', 'users.update', 'users.delete',
    'attendance.mark', 'attendance.read', 'attendance.manage',
    'lookups.create', 'lookups.read', 'lookups.update', 'lookups.delete',
    'settings.manage',
  ],
  manager: [
    'users.create', 'users.read', 'users.update',
    'attendance.mark', 'attendance.read', 'attendance.manage',
    'lookups.read',
  ],
  trainer: [
    'users.read',
    'attendance.mark', 'attendance.read',
    'lookups.read',
  ],
  user: [
    'attendance.read',
    'lookups.read',
  ],
};

async function seedUsers() {
  console.log('Seeding users...');

  const testUsers = [
    { name: 'Super Admin', email: 'superadmin@test.com', password: 'password123', role: 'superadmin' },
    { name: 'Admin User', email: 'admin@test.com', password: 'password123', role: 'admin' },
    { name: 'Manager User', email: 'manager@test.com', password: 'password123', role: 'manager' },
    { name: 'Trainer User', email: 'trainer@test.com', password: 'password123', role: 'trainer' },
    { name: 'Test User', email: 'user@test.com', password: 'password123', role: 'user' },
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
        status: 'active',
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

async function seedLookups() {
  console.log('Seeding lookups...');

  for (const [typeCode, values] of Object.entries(lookupValues)) {
    const lookupType = await prisma.lookupType.findUnique({
      where: { code: typeCode },
    });

    if (!lookupType) {
      console.log(`  LookupType ${typeCode} not found, skipping values...`);
      continue;
    }

    console.log(`  Seeding ${typeCode} values...`);

    for (const lookupData of values) {
      const existing = await prisma.lookup.findUnique({
        where: {
          lookupTypeId_code: {
            lookupTypeId: lookupType.id,
            code: lookupData.code,
          },
        },
      });

      if (existing) {
        continue;
      }

      await prisma.lookup.create({
        data: {
          ...lookupData,
          lookupTypeId: lookupType.id,
        },
      });
    }
    console.log(`    Created ${values.length} values for ${typeCode}`);
  }
}

async function seedPermissions() {
  console.log('Seeding permissions...');

  for (const permData of permissions) {
    const existing = await prisma.permission.findUnique({
      where: { code: permData.code },
    });

    if (existing) {
      continue;
    }

    await prisma.permission.create({
      data: permData,
    });
  }
  console.log(`  Created ${permissions.length} permissions`);
}

async function seedRolePermissions() {
  console.log('Seeding role permissions...');

  for (const [role, permCodes] of Object.entries(rolePermissions)) {
    console.log(`  Assigning permissions to ${role}...`);

    for (const permCode of permCodes) {
      const permission = await prisma.permission.findUnique({
        where: { code: permCode },
      });

      if (!permission) {
        console.log(`    Permission ${permCode} not found, skipping...`);
        continue;
      }

      const existing = await prisma.rolePermission.findUnique({
        where: {
          role_permissionId: {
            role,
            permissionId: permission.id,
          },
        },
      });

      if (existing) {
        continue;
      }

      await prisma.rolePermission.create({
        data: {
          role,
          permissionId: permission.id,
        },
      });
    }
    console.log(`    Assigned ${permCodes.length} permissions to ${role}`);
  }
}

async function main() {
  console.log('Starting seed...\n');

  await seedLookupTypes();
  console.log('');
  await seedLookups();
  console.log('');
  await seedPermissions();
  console.log('');
  await seedRolePermissions();
  console.log('');
  await seedUsers();

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
