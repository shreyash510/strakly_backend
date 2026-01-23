/**
 * Migration Script: Rename 'member' role to 'client'
 *
 * This script updates:
 * 1. Lookup table - changes code, name, value from 'member' to 'client'
 * 2. RolePermissionXref table - updates role column from 'member' to 'client'
 *
 * Run with: npx ts-node prisma/rename-member-to-client.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting migration: Rename member role to client...\n');

  // Step 1: Find the USER_ROLE lookup type
  const userRoleType = await prisma.lookupType.findUnique({
    where: { code: 'USER_ROLE' },
  });

  if (!userRoleType) {
    console.log('ERROR: USER_ROLE lookup type not found!');
    return;
  }

  console.log('Found USER_ROLE lookup type:', userRoleType.id);

  // Step 2: Find the member lookup
  const memberLookup = await prisma.lookup.findFirst({
    where: {
      lookupTypeId: userRoleType.id,
      code: 'member',
    },
  });

  if (!memberLookup) {
    console.log('No "member" role found in Lookup table. It may already be renamed to "client".');

    // Check if client already exists
    const clientLookup = await prisma.lookup.findFirst({
      where: {
        lookupTypeId: userRoleType.id,
        code: 'client',
      },
    });

    if (clientLookup) {
      console.log('✓ "client" role already exists in Lookup table.');
    }
  } else {
    console.log('Found member lookup:', memberLookup.id);

    // Step 3: Update the Lookup record
    await prisma.lookup.update({
      where: { id: memberLookup.id },
      data: {
        code: 'client',
        name: 'Client',
        value: 'client',
      },
    });
    console.log('✓ Updated Lookup: member -> client');
  }

  // Step 4: Update RolePermissionXref records
  const updatedPermissions = await prisma.rolePermissionXref.updateMany({
    where: { role: 'member' },
    data: { role: 'client' },
  });
  console.log(`✓ Updated ${updatedPermissions.count} RolePermissionXref records: member -> client`);

  // Step 5: Verify the changes
  console.log('\n--- Verification ---');

  const clientLookup = await prisma.lookup.findFirst({
    where: {
      lookupTypeId: userRoleType.id,
      code: 'client',
    },
  });
  console.log('Client lookup exists:', !!clientLookup);

  const clientPermissions = await prisma.rolePermissionXref.count({
    where: { role: 'client' },
  });
  console.log('Client role permissions count:', clientPermissions);

  const memberPermissions = await prisma.rolePermissionXref.count({
    where: { role: 'member' },
  });
  console.log('Member role permissions count (should be 0):', memberPermissions);

  // Count users with client role
  if (clientLookup) {
    const clientUsers = await prisma.user.count({
      where: { roleId: clientLookup.id },
    });
    console.log('Users with client role:', clientUsers);
  }

  console.log('\n✓ Migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during migration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
