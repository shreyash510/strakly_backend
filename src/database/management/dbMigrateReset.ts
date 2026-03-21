import db, { schemaNames } from "./db";
import { DbMigrationManager } from "./dbMigrationManager";

const logger = {
  info: (...args: any[]) => console.info("[dbMigrateReset]", ...args),
  error: (...args: any[]) => console.error("[dbMigrateReset]", ...args),
};

const main = async (): Promise<void> => {
  try {
    logger.info("Starting database reset...");

    const client = await db.getDbClient();

    // Get all tenant schemas and drop them
    try {
      const { rows: gyms } = await client.query(
        `SELECT id FROM public.gyms`,
      );
      for (const gym of gyms) {
        const tenantSchema = schemaNames.tenantSchemaName(gym.id);
        logger.info(`Dropping tenant schema: ${tenantSchema}`);
        await client.query(`DROP SCHEMA IF EXISTS ${tenantSchema} CASCADE`);
      }
    } catch {
      // gyms table might not exist yet — nothing to drop
      logger.info("No existing tenant schemas to drop");
    }

    logger.info("All tenant schemas dropped successfully");

    // Run tenant migrations
    logger.info("Running migrations...");
    const migrationManager = new DbMigrationManager();
    await migrationManager.handleMigration();

    logger.info("Database reset completed successfully!");
  } catch (error) {
    logger.error("Database reset failed:", error);
    process.exit(1);
  } finally {
    await db.shutdown();
    process.exit(0);
  }
};

main();
