const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:root@localhost:5432/postgres'
});

async function updateConstraints() {
    await client.connect();

    const tenantSchema = 'tenant_1';

    try {
        console.log(`Updating constraints for schema: ${tenantSchema}`);

        // Drop existing constraints
        await client.query(`ALTER TABLE "${tenantSchema}"."payments" DROP CONSTRAINT IF EXISTS "chk_tenant_1_payments_reference_table"`);
        await client.query(`ALTER TABLE "${tenantSchema}"."payments" DROP CONSTRAINT IF EXISTS "chk_tenant_1_payments_payer_type"`);
        await client.query(`ALTER TABLE "${tenantSchema}"."payments" DROP CONSTRAINT IF EXISTS "chk_tenant_1_payments_payee_type"`);

        // Add updated constraints
        await client.query(`
      ALTER TABLE "${tenantSchema}"."payments"
      ADD CONSTRAINT "chk_tenant_1_payments_reference_table"
      CHECK (reference_table IN ('memberships', 'staff_salaries', 'plans', 'offers', 'product_sales'))
    `);

        await client.query(`
      ALTER TABLE "${tenantSchema}"."payments"
      ADD CONSTRAINT "chk_tenant_1_payments_payer_type"
      CHECK (payer_type IN ('client', 'gym', 'staff', 'admin', 'guest'))
    `);

        await client.query(`
      ALTER TABLE "${tenantSchema}"."payments"
      ADD CONSTRAINT "chk_tenant_1_payments_payee_type"
      CHECK (payee_type IS NULL OR payee_type IN ('client', 'gym', 'staff', 'admin', 'guest'))
    `);

        console.log('Successfully updated constraints!');
    } catch (error) {
        console.error('Error updating constraints:', error);
    } finally {
        await client.end();
    }
}

updateConstraints();
