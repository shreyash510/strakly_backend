import { DbMigrationManager } from "./dbMigrationManager";

const logger = {
  info: (...args: any[]) => console.info("[dbMigrate]", ...args),
  error: (...args: any[]) => console.error("[dbMigrate]", ...args),
};

const main = async (): Promise<void> => {
  try {
    const migrationManager = new DbMigrationManager();
    await migrationManager.handleMigration();
  } catch (error) {
    logger.error("Fatal error in main function:", error);
    process.exit(1);
  } finally {
    logger.info("Migration script exiting...");
    process.exit();
  }
};

main();
