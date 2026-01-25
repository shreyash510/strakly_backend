import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 10;

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
    { code: 'client', name: 'Client', value: 'client', displayOrder: 5 },
  ],
  USER_STATUS: [
    { code: 'active', name: 'Active', value: 'active', displayOrder: 1 },
    { code: 'inactive', name: 'Inactive', value: 'inactive', displayOrder: 2 },
    { code: 'suspended', name: 'Suspended', value: 'suspended', displayOrder: 3 },
    { code: 'pending', name: 'Pending', value: 'pending', displayOrder: 4 },
    { code: 'rejected', name: 'Rejected', value: 'rejected', displayOrder: 5 },
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
  // Dashboard module
  { code: 'dashboard.view', name: 'View Dashboard', module: 'dashboard', description: 'Access dashboard' },

  // Users module (superadmin - all users)
  { code: 'users.view', name: 'View Users', module: 'users', description: 'View all users' },
  { code: 'users.manage', name: 'Manage Users', module: 'users', description: 'Create/edit/delete users' },

  // Members module (admin/manager)
  { code: 'members.view', name: 'View Members', module: 'members', description: 'View member list' },
  { code: 'members.manage', name: 'Manage Members', module: 'members', description: 'Create/edit/delete members' },

  // Managers module (admin only)
  { code: 'managers.view', name: 'View Managers', module: 'managers', description: 'View manager list' },
  { code: 'managers.manage', name: 'Manage Managers', module: 'managers', description: 'Create/edit/delete managers' },

  // Trainers module
  { code: 'trainers.view', name: 'View Trainers', module: 'trainers', description: 'View trainer list' },
  { code: 'trainers.manage', name: 'Manage Trainers', module: 'trainers', description: 'Create/edit/delete trainers' },

  // Requests module (pending user registrations)
  { code: 'requests.view', name: 'View Requests', module: 'requests', description: 'View pending registration requests' },
  { code: 'requests.manage', name: 'Manage Requests', module: 'requests', description: 'Approve/reject registration requests' },

  // Clients module (trainer's clients)
  { code: 'clients.view', name: 'View Clients', module: 'clients', description: 'View assigned clients' },

  // Attendance module
  { code: 'attendance.view', name: 'View Attendance', module: 'attendance', description: 'View own attendance' },
  { code: 'attendance.manage', name: 'Manage Attendance', module: 'attendance', description: 'Mark/edit attendance records' },

  // Subscription module
  { code: 'subscription.view', name: 'View Subscription', module: 'subscription', description: 'View own subscription' },
  { code: 'subscription.manage', name: 'Manage Subscriptions', module: 'subscription', description: 'Manage membership plans' },

  // Gym module (superadmin)
  { code: 'gym.view', name: 'View Gym', module: 'gym', description: 'View gym details' },
  { code: 'gym.manage', name: 'Manage Gym', module: 'gym', description: 'Manage gym settings' },

  // Contact Requests module (superadmin)
  { code: 'contact_requests.view', name: 'View Contact Requests', module: 'contact_requests', description: 'View contact form submissions' },
  { code: 'contact_requests.manage', name: 'Manage Contact Requests', module: 'contact_requests', description: 'Manage contact form submissions' },

  // SaaS Subscriptions module (superadmin)
  { code: 'saas_subscriptions.view', name: 'View SaaS Subscriptions', module: 'saas_subscriptions', description: 'View gym subscriptions' },
  { code: 'saas_subscriptions.manage', name: 'Manage SaaS Subscriptions', module: 'saas_subscriptions', description: 'Manage gym subscriptions' },

  // Health & Fitness module
  { code: 'health.view', name: 'View Health & Fitness', module: 'health', description: 'View health data' },

  // Support module
  { code: 'support.view', name: 'View Support', module: 'support', description: 'View support tickets' },
  { code: 'support.manage', name: 'Manage Support', module: 'support', description: 'Manage support tickets' },

  // Settings module
  { code: 'settings.view', name: 'View Settings', module: 'settings', description: 'View settings' },
  { code: 'settings.manage', name: 'Manage Settings', module: 'settings', description: 'Manage system settings' },

  // Reports & Analytics module
  { code: 'reports.view', name: 'View Reports', module: 'reports', description: 'View reports' },
  { code: 'analytics.view', name: 'View Analytics', module: 'analytics', description: 'View analytics' },

  // Profile module
  { code: 'profile.view', name: 'View Profile', module: 'profile', description: 'View own profile' },

  // Share App module
  { code: 'share_app.view', name: 'View Share App', module: 'share_app', description: 'Access share app QR code' },

  // Lookups module
  { code: 'lookups.read', name: 'Read Lookups', module: 'lookups', description: 'View lookup values' },
  { code: 'lookups.manage', name: 'Manage Lookups', module: 'lookups', description: 'Manage lookup values' },

  // Permissions module
  { code: 'permissions.manage', name: 'Manage Permissions', module: 'permissions', description: 'Manage role permissions' },

  // Salary module (admin only)
  { code: 'salary.view', name: 'View Salary', module: 'salary', description: 'View staff salary records' },
  { code: 'salary.manage', name: 'Manage Salary', module: 'salary', description: 'Manage staff salary records' },

  // Role Permissions module (superadmin only)
  { code: 'role_permissions.manage', name: 'Manage Role Permissions', module: 'role_permissions', description: 'Manage role permissions' },
];

// Role permissions mapping - which permissions each role has
const rolePermissions: Record<string, string[]> = {
  superadmin: [
    // Dashboard
    'dashboard.view',
    // Gym Management
    'gym.view',
    'gym.manage',
    // User Management (all users)
    'users.view',
    'users.manage',
    // Contact Requests
    'contact_requests.view',
    'contact_requests.manage',
    // SaaS Subscriptions
    'saas_subscriptions.view',
    'saas_subscriptions.manage',
    // Reports & Analytics
    'reports.view',
    'analytics.view',
    // Settings
    'settings.view',
    'settings.manage',
    // Profile
    'profile.view',
    // Support (can manage all tickets)
    'support.view',
    'support.manage',
    // Share App
    'share_app.view',
    // Role Permissions
    'role_permissions.manage',
    // Permissions module
    'permissions.manage',
  ],

  admin: [
    // Dashboard
    'dashboard.view',
    // Member Management
    'members.view',
    'members.manage',
    // Trainer Management
    'trainers.view',
    'trainers.manage',
    // Manager Management
    'managers.view',
    'managers.manage',
    // Requests Management
    'requests.view',
    'requests.manage',
    // Reports & Analytics
    'reports.view',
    'analytics.view',
    // Subscriptions
    'subscription.manage',
    // Attendance
    'attendance.manage',
    // Settings
    'settings.view',
    'settings.manage',
    // Profile
    'profile.view',
    // Support (view only)
    'support.view',
    // Share App
    'share_app.view',
    // Salary
    'salary.view',
    'salary.manage',
  ],

  manager: [
    // Dashboard
    'dashboard.view',
    // Member Management
    'members.view',
    'members.manage',
    // Trainer Management
    'trainers.view',
    'trainers.manage',
    // Requests Management
    'requests.view',
    'requests.manage',
    // Reports & Analytics
    'reports.view',
    'analytics.view',
    // Attendance
    'attendance.manage',
    // Settings
    'settings.view',
    'settings.manage',
    // Profile
    'profile.view',
    // Share App
    'share_app.view',
  ],

  trainer: [
    // Dashboard
    'dashboard.view',
    // View my clients (trainer's assigned clients)
    'clients.view',
    // Reports (limited)
    'reports.view',
    // Attendance
    'attendance.manage',
    // Settings (own profile)
    'settings.view',
    // Profile
    'profile.view',
    // Share App
    'share_app.view',
  ],

  client: [
    // Dashboard
    'dashboard.view',
    // Subscription (view own subscription)
    'subscription.view',
    // Attendance (view own attendance)
    'attendance.view',
    // Health & Fitness
    'health.view',
    // Profile
    'profile.view',
    // Settings (own profile)
    'settings.view',
    // Support
    'support.view',
    // Share App
    'share_app.view',
  ],
};

// SaaS Plans (Platform subscription plans for gyms)
const saasPlans = [
  {
    code: 'free',
    name: 'Free',
    description: 'Perfect for trying out Strakly',
    price: 0,
    currency: 'INR',
    billingPeriod: 'monthly',
    maxMembers: 50,
    maxStaff: 1,
    maxBranches: 1,
    features: [
      'Up to 50 members',
      'Basic attendance tracking',
      'Member management',
      '1 admin account',
      'Email support',
      'Basic reports',
    ],
    displayOrder: 1,
    isFeatured: false,
    badge: null,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For growing gyms and fitness centers',
    price: 499,
    currency: 'INR',
    billingPeriod: 'monthly',
    maxMembers: 500,
    maxStaff: 5,
    maxBranches: 1,
    features: [
      'Up to 500 members',
      'Advanced attendance tracking',
      'Member management',
      '5 staff accounts',
      'Priority email support',
      'Advanced reports & analytics',
      'QR code check-in',
      'Custom branding',
    ],
    displayOrder: 2,
    isFeatured: true,
    badge: 'Most Popular',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'For large fitness chains and franchises',
    price: 999,
    currency: 'INR',
    billingPeriod: 'monthly',
    maxMembers: -1, // unlimited
    maxStaff: -1, // unlimited
    maxBranches: -1, // unlimited
    features: [
      'Unlimited members',
      'Advanced attendance tracking',
      'Member management',
      'Unlimited staff accounts',
      '24/7 phone & email support',
      'Advanced reports & analytics',
      'QR code check-in',
      'Custom branding',
      'Multiple branches',
      'API access',
    ],
    displayOrder: 3,
    isFeatured: false,
    badge: 'Best Value',
  },
];

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

      const existing = await prisma.rolePermissionXref.findUnique({
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

      await prisma.rolePermissionXref.create({
        data: {
          role,
          permissionId: permission.id,
        },
      });
    }
    console.log(`    Assigned ${permCodes.length} permissions to ${role}`);
  }
}

async function seedSaasPlans() {
  console.log('Seeding SaaS plans...');

  for (const planData of saasPlans) {
    const existing = await prisma.saasPlan.findUnique({
      where: { code: planData.code },
    });

    if (existing) {
      console.log(`  SaaS plan ${planData.code} already exists, skipping...`);
      continue;
    }

    await prisma.saasPlan.create({
      data: planData,
    });
    console.log(`  Created SaaS plan: ${planData.code}`);
  }
}

async function seedSuperadmin() {
  console.log('Seeding superadmin...');

  const superadminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@strakly.com';
  const superadminPassword = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123';
  const superadminName = process.env.SUPERADMIN_NAME || 'Super Admin';

  const existing = await prisma.systemUser.findUnique({
    where: { email: superadminEmail },
  });

  if (existing) {
    console.log(`  Superadmin ${superadminEmail} already exists, skipping...`);
    return;
  }

  const passwordHash = await bcrypt.hash(superadminPassword, SALT_ROUNDS);

  await prisma.systemUser.create({
    data: {
      email: superadminEmail,
      passwordHash,
      name: superadminName,
      role: 'superadmin',
      isActive: true,
    },
  });

  console.log(`  Created superadmin: ${superadminEmail}`);
  console.log(`  Default password: ${superadminPassword}`);
  console.log('  ⚠️  Please change the password after first login!');
}

async function main() {
  console.log('Starting seed...\n');
  console.log('NOTE: This seeds PUBLIC schema tables only.');
  console.log('Gyms and users are created via the signup flow.\n');

  await seedLookupTypes();
  console.log('');
  await seedLookups();
  console.log('');
  await seedPermissions();
  console.log('');
  await seedRolePermissions();
  console.log('');
  await seedSaasPlans();
  console.log('');
  await seedSuperadmin();

  console.log('\nSeed completed!');
  console.log('\nTo create a gym with admin user, use the signup flow at /signup');
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
