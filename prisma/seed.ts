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
  { code: 'TICKET_STATUS', name: 'Ticket Status', description: 'Support ticket status options' },
  { code: 'TICKET_CATEGORY', name: 'Ticket Category', description: 'Support ticket category options' },
  { code: 'TICKET_PRIORITY', name: 'Ticket Priority', description: 'Support ticket priority options' },
];

// Lookup values for each type
const lookupValues: Record<string, Array<{ code: string; name: string; value?: string; displayOrder: number }>> = {
  USER_ROLE: [
    { code: 'superadmin', name: 'Super Admin', value: 'superadmin', displayOrder: 1 },
    { code: 'admin', name: 'Admin', value: 'admin', displayOrder: 2 },
    { code: 'branch_admin', name: 'Branch Admin', value: 'branch_admin', displayOrder: 3 },
    { code: 'manager', name: 'Manager', value: 'manager', displayOrder: 4 },
    { code: 'trainer', name: 'Trainer', value: 'trainer', displayOrder: 5 },
    { code: 'client', name: 'Client', value: 'client', displayOrder: 6 },
  ],
  USER_STATUS: [
    { code: 'onboarding', name: 'Onboarding', value: 'onboarding', displayOrder: 1 },
    { code: 'confirm', name: 'Confirm', value: 'confirm', displayOrder: 2 },
    { code: 'active', name: 'Active', value: 'active', displayOrder: 3 },
    { code: 'expired', name: 'Expired', value: 'expired', displayOrder: 4 },
    { code: 'inactive', name: 'Inactive', value: 'inactive', displayOrder: 5 },
    { code: 'rejected', name: 'Rejected', value: 'rejected', displayOrder: 6 },
    { code: 'archive', name: 'Archive', value: 'archive', displayOrder: 7 },
    { code: 'suspended', name: 'Suspended', value: 'suspended', displayOrder: 8 },
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
  TICKET_STATUS: [
    { code: 'open', name: 'Open', value: 'open', displayOrder: 1 },
    { code: 'in_progress', name: 'In Progress', value: 'in_progress', displayOrder: 2 },
    { code: 'waiting_for_response', name: 'Waiting for Response', value: 'waiting_for_response', displayOrder: 3 },
    { code: 'resolved', name: 'Resolved', value: 'resolved', displayOrder: 4 },
    { code: 'closed', name: 'Closed', value: 'closed', displayOrder: 5 },
  ],
  TICKET_CATEGORY: [
    { code: 'general', name: 'General', value: 'general', displayOrder: 1 },
    { code: 'technical', name: 'Technical', value: 'technical', displayOrder: 2 },
    { code: 'billing', name: 'Billing', value: 'billing', displayOrder: 3 },
    { code: 'feedback', name: 'Feedback', value: 'feedback', displayOrder: 4 },
    { code: 'complaint', name: 'Complaint', value: 'complaint', displayOrder: 5 },
  ],
  TICKET_PRIORITY: [
    { code: 'low', name: 'Low', value: 'low', displayOrder: 1 },
    { code: 'medium', name: 'Medium', value: 'medium', displayOrder: 2 },
    { code: 'high', name: 'High', value: 'high', displayOrder: 3 },
    { code: 'urgent', name: 'Urgent', value: 'urgent', displayOrder: 4 },
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

  // Gym Profile module (admin - own gym)
  { code: 'view_gym_profile', name: 'View Gym Profile', module: 'gym_profile', description: 'View own gym profile' },
  { code: 'manage_gym_profile', name: 'Manage Gym Profile', module: 'gym_profile', description: 'Manage own gym profile' },

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

  // Programs/Diet module
  { code: 'programs.manage', name: 'Manage Programs', module: 'programs', description: 'Create and manage diet programs' },
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
    // Permissions module
    'permissions.manage',
  ],

  admin: [
    // Dashboard
    'dashboard.view',
    // Gym Profile (own gym)
    'view_gym_profile',
    'manage_gym_profile',
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
    // Programs/Diet
    'programs.manage',
  ],

  branch_admin: [
    // Dashboard
    'dashboard.view',
    // Gym Profile (view only)
    'view_gym_profile',
    // Member Management (branch-specific)
    'members.view',
    'members.manage',
    // Trainer Management (branch-specific)
    'trainers.view',
    'trainers.manage',
    // Requests Management (branch-specific)
    'requests.view',
    'requests.manage',
    // Reports & Analytics (branch-specific)
    'reports.view',
    'analytics.view',
    // Subscriptions (branch-specific)
    'subscription.manage',
    // Attendance (branch-specific)
    'attendance.manage',
    // Settings (own profile only)
    'settings.view',
    // Profile
    'profile.view',
    // Support
    'support.view',
    // Share App
    'share_app.view',
    // Salary (branch-specific)
    'salary.view',
    'salary.manage',
    // Programs/Diet (branch-specific)
    'programs.manage',
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
    // Subscriptions (memberships, plans, offers)
    'subscription.manage',
    // Attendance
    'attendance.manage',
    // Settings
    'settings.view',
    'settings.manage',
    // Profile
    'profile.view',
    // Share App
    'share_app.view',
    // Programs/Diet
    'programs.manage',
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
    currency: 'USD',
    billingPeriod: 'monthly',
    maxMembers: 50,
    maxStaff: 1,
    maxBranches: 0,
    features: [],
    displayOrder: 1,
    isFeatured: false,
    badge: null,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For growing gyms and fitness centers',
    price: 5,
    currency: 'USD',
    billingPeriod: 'monthly',
    maxMembers: 500,
    maxStaff: 5,
    maxBranches: 2,
    features: [
      'ai_chat',
      'diet_planning',
      'body_metrics',
      'announcements',
      'offers',
      'trainer_assignment',
      'amenities_management',
    ],
    displayOrder: 2,
    isFeatured: true,
    badge: 'Most Popular',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'For large fitness chains and franchises',
    price: 10,
    currency: 'USD',
    billingPeriod: 'monthly',
    maxMembers: -1, // unlimited
    maxStaff: -1, // unlimited
    maxBranches: -1, // unlimited
    features: [
      'ai_chat',
      'advanced_ai_chat',
      'diet_planning',
      'body_metrics',
      'salary_management',
      'data_migration',
      'activity_logs',
      'announcements',
      'offers',
      'payment_gateway',
      'advanced_reports',
      'trainer_assignment',
      'amenities_management',
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

// Default facilities for tenant schemas
const defaultFacilities = [
  {
    code: 'GYM_FLOOR',
    name: 'Gym Floor',
    description: 'Main workout area with weight machines and free weights',
    icon: 'Dumbbell',
    display_order: 1,
  },
  {
    code: 'CARDIO',
    name: 'Cardio Zone',
    description: 'Treadmills, ellipticals, stationary bikes, and rowing machines',
    icon: 'Activity',
    display_order: 2,
  },
  {
    code: 'YOGA',
    name: 'Yoga Studio',
    description: 'Dedicated space for yoga, meditation, and stretching',
    icon: 'Sparkles',
    display_order: 3,
  },
  {
    code: 'CROSSFIT',
    name: 'CrossFit Area',
    description: 'Functional training area with CrossFit equipment',
    icon: 'Flame',
    display_order: 4,
  },
  {
    code: 'POOL',
    name: 'Swimming Pool',
    description: 'Indoor heated swimming pool',
    icon: 'Waves',
    display_order: 5,
  },
  {
    code: 'SAUNA',
    name: 'Sauna',
    description: 'Steam and dry sauna rooms for relaxation',
    icon: 'Flame',
    display_order: 6,
  },
];

// Default amenities for tenant schemas
const defaultAmenities = [
  {
    code: 'WIFI',
    name: 'Free WiFi',
    description: 'High-speed wireless internet access',
    icon: 'Wifi',
    display_order: 1,
  },
  {
    code: 'LOCKER',
    name: 'Locker Room',
    description: 'Secure lockers for personal belongings',
    icon: 'Lock',
    display_order: 2,
  },
  {
    code: 'SHOWER',
    name: 'Showers',
    description: 'Clean shower facilities with hot water',
    icon: 'Droplets',
    display_order: 3,
  },
  {
    code: 'TOWEL',
    name: 'Towel Service',
    description: 'Fresh towels provided for members',
    icon: 'Shirt',
    display_order: 4,
  },
  {
    code: 'PARKING',
    name: 'Free Parking',
    description: 'Complimentary parking for members',
    icon: 'Car',
    display_order: 5,
  },
  {
    code: 'CAFE',
    name: 'Juice Bar',
    description: 'Healthy drinks, protein shakes, and snacks',
    icon: 'Coffee',
    display_order: 6,
  },
  {
    code: 'AC',
    name: 'Air Conditioning',
    description: 'Climate controlled environment',
    icon: 'AirVent',
    display_order: 7,
  },
  {
    code: 'WATER',
    name: 'Water Station',
    description: 'Filtered drinking water stations',
    icon: 'GlassWater',
    display_order: 8,
  },
];

// Default membership plans for tenant schemas
const defaultPlans = [
  {
    code: 'monthly',
    name: 'Monthly Plan',
    description: 'Perfect for getting started with your fitness journey',
    duration_value: 30,
    duration_type: 'days',
    price: 999,
    features: JSON.stringify([
      'Full gym access',
      'Basic equipment usage',
      'Locker room access',
      'Fitness assessment',
    ]),
    display_order: 1,
    is_featured: false,
  },
  {
    code: 'quarterly',
    name: 'Quarterly Plan',
    description: 'Our most popular plan with great value for committed members',
    duration_value: 90,
    duration_type: 'days',
    price: 2499,
    features: JSON.stringify([
      'Full gym access',
      'All equipment usage',
      'Locker room access',
      'Fitness assessment',
      '1 Personal training session',
      'Diet consultation',
    ]),
    display_order: 2,
    is_featured: true,
  },
  {
    code: 'annual',
    name: 'Annual Plan',
    description: 'Best value for long-term fitness commitment',
    duration_value: 365,
    duration_type: 'days',
    price: 7999,
    features: JSON.stringify([
      'Full gym access',
      'All equipment usage',
      'Locker room access',
      'Monthly fitness assessment',
      '4 Personal training sessions',
      'Diet consultation',
      'Priority booking',
      'Guest passes (2/month)',
    ]),
    display_order: 3,
    is_featured: false,
  },
];

async function seedTenantPlans() {
  console.log('Seeding default plans for all tenant schemas...');

  const client = await pool.connect();
  try {
    // Get all tenant schemas
    const schemasResult = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant_%'
    `);

    console.log(`  Found ${schemasResult.rows.length} tenant schemas`);

    for (const row of schemasResult.rows) {
      const schemaName = row.schema_name;

      // Check if plans already exist
      const plansResult = await client.query(`SELECT COUNT(*) as count FROM "${schemaName}".plans`);
      if (parseInt(plansResult.rows[0].count) > 0) {
        console.log(`  ${schemaName}: Already has plans, skipping...`);
        continue;
      }

      // Seed default plans
      for (const plan of defaultPlans) {
        await client.query(`
          INSERT INTO "${schemaName}"."plans"
          (code, name, description, duration_value, duration_type, price, features, display_order, is_featured, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
          ON CONFLICT (code) DO NOTHING
        `, [
          plan.code,
          plan.name,
          plan.description,
          plan.duration_value,
          plan.duration_type,
          plan.price,
          plan.features,
          plan.display_order,
          plan.is_featured,
        ]);
      }
      console.log(`  ${schemaName}: Seeded 3 default plans`);
    }
  } finally {
    client.release();
  }
}

async function seedTenantFacilitiesAndAmenities() {
  console.log('Seeding default facilities and amenities for all tenant schemas...');

  const client = await pool.connect();
  try {
    // Get all tenant schemas
    const schemasResult = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant_%'
    `);

    console.log(`  Found ${schemasResult.rows.length} tenant schemas`);

    for (const row of schemasResult.rows) {
      const schemaName = row.schema_name;

      // Check if facilities table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = 'facilities'
        )
      `, [schemaName]);

      if (!tableCheck.rows[0].exists) {
        console.log(`  ${schemaName}: facilities table does not exist, skipping...`);
        continue;
      }

      // Check if facilities already exist
      const facilitiesResult = await client.query(`SELECT COUNT(*) as count FROM "${schemaName}".facilities`);
      if (parseInt(facilitiesResult.rows[0].count) === 0) {
        // Seed default facilities
        for (const facility of defaultFacilities) {
          await client.query(`
            INSERT INTO "${schemaName}"."facilities"
            (code, name, description, icon, display_order, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
            ON CONFLICT (branch_id, code) DO NOTHING
          `, [
            facility.code,
            facility.name,
            facility.description,
            facility.icon,
            facility.display_order,
          ]);
        }
        console.log(`  ${schemaName}: Seeded ${defaultFacilities.length} default facilities`);
      } else {
        console.log(`  ${schemaName}: Facilities already exist, skipping...`);
      }

      // Check if amenities already exist
      const amenitiesResult = await client.query(`SELECT COUNT(*) as count FROM "${schemaName}".amenities`);
      if (parseInt(amenitiesResult.rows[0].count) === 0) {
        // Seed default amenities
        for (const amenity of defaultAmenities) {
          await client.query(`
            INSERT INTO "${schemaName}"."amenities"
            (code, name, description, icon, display_order, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
            ON CONFLICT (branch_id, code) DO NOTHING
          `, [
            amenity.code,
            amenity.name,
            amenity.description,
            amenity.icon,
            amenity.display_order,
          ]);
        }
        console.log(`  ${schemaName}: Seeded ${defaultAmenities.length} default amenities`);
      } else {
        console.log(`  ${schemaName}: Amenities already exist, skipping...`);
      }
    }
  } finally {
    client.release();
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
  await seedSaasPlans();
  console.log('');
  await seedSuperadmin();
  console.log('');
  await seedTenantPlans();
  console.log('');
  await seedTenantFacilitiesAndAmenities();

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
