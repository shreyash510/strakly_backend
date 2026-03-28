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
    `SELECT tenant_schema_name FROM gyms WHERE tenant_schema_name IS NOT NULL AND is_active = true LIMIT 1`
  );
  const schema = gyms.rows[0].tenant_schema_name;
  console.log(`Checking schema: ${schema}`);

  const result = await client.query(
    `SELECT version, name, md5 FROM "${schema}".migrations ORDER BY version::int`
  );

  for (const row of result.rows) {
    console.log(`${row.version} | ${row.name} | ${row.md5}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
