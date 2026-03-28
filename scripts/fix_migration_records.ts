import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
  await client.connect();
  console.log('Connected');

  const gyms = await client.query(
    `SELECT id, name, tenant_schema_name FROM gyms WHERE tenant_schema_name IS NOT NULL AND is_active = true`
  );

  console.log(`Found ${gyms.rows.length} active gyms\n`);

  for (const gym of gyms.rows) {
    const schema = gym.tenant_schema_name;
    try {
      // Remove the orphaned migration record (the migration already ran, its changes are in the DB)
      const result = await client.query(
        `DELETE FROM "${schema}".migrations WHERE name = '005_tenant_restore_branch_id_columns.sql'`
      );
      console.log(`[${schema}] ${gym.name}: Removed ${result.rowCount} orphaned migration record(s)`);
    } catch (err: any) {
      console.error(`[${schema}] ${gym.name}: Error - ${err.message}`);
    }
  }

  console.log('\nDone. Now run `npm run db:migrate` to apply pending migrations.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
