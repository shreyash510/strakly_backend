import { Client } from 'pg';

export async function runTenantSeed(client: Client, schemaName: string): Promise<void> {
  // Tenant seed data is handled by seed migrations (024, 026, 030, 033, 037)
}
