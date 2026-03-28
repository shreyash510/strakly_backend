import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

const DEFAULT_MANAGER_PERMISSIONS = {
  clients: { create: true, read: true, update: true, delete: true },
  requests: { create: true, read: true, update: true, delete: true },
  trainers: { create: true, read: true, update: true, delete: true },
  support: { create: true, read: true, update: true, delete: true },
  classes: { create: true, read: true, update: true, delete: true },
  salary: { create: true, read: true, update: true, delete: true },
  announcements: { create: true, read: true, update: true, delete: true },
  amenities: { create: true, read: true, update: true, delete: true },
  attendance: { create: true, read: true, update: true, delete: true },
  referrals: { create: true, read: true, update: true, delete: true },
  appointments: { create: true, read: true, update: true, delete: true },
  equipment: { create: true, read: true, update: true, delete: true },
  guestVisits: { create: true, read: true, update: true, delete: true },
  leads: { create: true, read: true, update: true, delete: true },
  facilities: { create: true, read: true, update: true, delete: true },
  offers: { create: true, read: true, update: true, delete: true },
  subscriptions: { create: true, read: true, update: true, delete: true },
  products: { create: true, read: true, update: true, delete: true },
  productSales: { create: true, read: true, update: true, delete: true },
  programs: { create: true, read: true, update: true, delete: true },
  plans: { create: true, read: true, update: true, delete: true },
};

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to database');

  // Get all active gyms with tenant schemas
  const gyms = await client.query(
    `SELECT id, name, tenant_schema_name FROM gyms WHERE tenant_schema_name IS NOT NULL AND is_active = true`
  );

  console.log(`Found ${gyms.rows.length} active gyms`);

  let totalUpdated = 0;

  for (const gym of gyms.rows) {
    const schema = gym.tenant_schema_name;
    try {
      const result = await client.query(
        `UPDATE "${schema}".users
         SET manager_permissions = $1
         WHERE role = 'manager'
           AND (manager_permissions IS NULL)
           AND (is_deleted = FALSE OR is_deleted IS NULL)`,
        [JSON.stringify(DEFAULT_MANAGER_PERMISSIONS)]
      );
      if (result.rowCount && result.rowCount > 0) {
        console.log(`  [${schema}] ${gym.name}: Updated ${result.rowCount} manager(s)`);
        totalUpdated += result.rowCount;
      } else {
        console.log(`  [${schema}] ${gym.name}: No managers to update`);
      }
    } catch (err: any) {
      console.error(`  [${schema}] ${gym.name}: Error - ${err.message}`);
    }
  }

  console.log(`\nDone. Total managers updated: ${totalUpdated}`);
  await client.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
