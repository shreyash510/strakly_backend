/**
 * One-off: apply the expense approval/control columns + audit table to every
 * existing tenant schema. Use when the sequential migration runner is blocked
 * (e.g. by an unrelated MD5 mismatch on an older migration).
 *
 * Usage:  npx ts-node scripts/apply-expense-controls.ts
 *
 * Idempotent — uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS.
 * Does NOT write to the `migrations` version table; once the blocker is resolved,
 * re-running `npm run db:migrate` will still try to apply 008 and skip no-ops cleanly.
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DIRECT_URL / DATABASE_URL not set');

  const client = new Client({ connectionString: url });
  await client.connect();

  const { rows: gyms } = await client.query<{ id: number; name: string }>(
    `SELECT id, name FROM public.gyms ORDER BY id`,
  );

  for (const gym of gyms) {
    const schema = `tenant_${gym.id}`;
    try {
      await client.query(`SET search_path TO "${schema}", public`);

      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS title            VARCHAR(255)`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by       INTEGER`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS staff_id         INTEGER`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reason           TEXT`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status  VARCHAR(20) NOT NULL DEFAULT 'pending_approval'`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_by_id  INTEGER`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMP`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMP`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejected_by_id   INTEGER`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejected_at      TIMESTAMP`);
      await client.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_staff_id        ON expenses(staff_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_approval_status ON expenses(approval_status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by    ON expenses(submitted_by_id)`);

      await client.query(`
        UPDATE expenses
           SET approval_status = 'approved',
               approved_at     = COALESCE(approved_at, updated_at, created_at, NOW())
         WHERE approval_status = 'pending_approval'
           AND created_at < NOW() - INTERVAL '1 second'
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS expense_approval_history (
          id          SERIAL PRIMARY KEY,
          expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
          action      VARCHAR(30) NOT NULL,
          actor_id    INTEGER NOT NULL,
          notes       TEXT,
          old_values  JSONB,
          new_values  JSONB,
          created_at  TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expense_approval_history_expense ON expense_approval_history(expense_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expense_approval_history_actor   ON expense_approval_history(actor_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_expense_approval_history_created ON expense_approval_history(created_at DESC)`);

      await client.query(`RESET search_path`);
      console.log(`[ok] ${schema} (${gym.name})`);
    } catch (err: any) {
      console.error(`[fail] ${schema} (${gym.name}): ${err.message}`);
    }
  }

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
