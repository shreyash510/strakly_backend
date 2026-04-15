import { Umzug } from "umzug";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { Client } from "pg";
import db, { schemaNames } from "./db";

// Use process.cwd() for current working directory
const currentDir = process.cwd();

const logger = {
  info: (...args: any[]) => console.info("[Migration]", ...args),
  warn: (...args: any[]) => console.warn("[Migration]", ...args),
  error: (...args: any[]) => console.error("[Migration]", ...args),
  debug: (...args: any[]) => console.debug("[Migration]", ...args),
};

interface MigrationFile {
  name: string;
  version: number;
  fullPath: string;
}

interface AppliedMigration {
  version: string;
  name: string;
  md5: string;
}

export class DbMigrationManager {
  /**
   * Calculate MD5 hash of a file
   */
  private async getFileMd5(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, "utf8");
    return crypto.createHash("md5").update(content).digest("hex");
  }

  /**
   * Extract version number from migration filename
   */
  private extractVersion(name: string): number | null {
    const match = name.match(/^(\d+)_/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Validate migration filename follows snake_case convention
   */
  private validateMigrationFileName(fileName: string): void {
    /* Extract the name part after version prefix (e.g., "001_initial_setup.sql" -> "initial_setup.sql") */
    const versionMatch = fileName.match(/^\d+_(.+)$/);
    if (
      !(
        fileName.endsWith(".js") ||
        fileName.endsWith(".ts") ||
        fileName.endsWith(".sql")
      ) ||
      !versionMatch
    ) {
      throw new Error(
        `Invalid migration filename format: ${fileName}\n` +
          `Expected format: <version>_<snake_case_name>.<extension>\n` +
          `Example: 001_initial_setup.sql or 002_user_roles_permission.ts`,
      );
    }

    const namePart = versionMatch[1];
    /* Remove file extension for validation */
    const nameWithoutExt = namePart.replace(/\.(ts|js|sql)$/, "");

    /* Snake_case pattern: lowercase letters, numbers, and underscores only */
    /* Must start with a letter or number, can contain underscores */
    const snakeCasePattern = /^[a-z0-9]+(_[a-z0-9]+)*$/;

    if (!snakeCasePattern.test(nameWithoutExt)) {
      throw new Error(
        `Invalid migration filename: ${fileName}\n` +
          `Filename must follow snake_case convention (lowercase letters, numbers, and underscores only).\n` +
          `Invalid name part: "${nameWithoutExt}"\n` +
          `Valid examples:\n` +
          `  001_initial_setup.sql\n` +
          `  002_user_roles_permission.ts\n` +
          `  003_add_customer_table.js\n` +
          `Invalid examples:\n` +
          `  001-initial_setup.sql (hyphen instead of underscore)\n` +
          `  001-initialSetup.sql (camelCase)\n` +
          `  001-Initial-Setup.sql (PascalCase and hyphens)\n` +
          `  001-initial setup.sql (spaces)`,
      );
    }
  }

  /**
   * Validate migration file - check imports and exports for security and standards compliance
   */
  private async validateMigrationFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf8");
    const fileName = path.basename(filePath);
    const violations: string[] = [];

    // === IMPORT VALIDATION ===
    // Regular expressions to match different import patterns
    const importPatterns = [
      // ES6 imports: import ... from '...'
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g,
      // CommonJS require: require('...')
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      // Dynamic imports: import('...')
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    ];

    const localImportPatterns = [
      /^\.\.?\//, // Relative imports: ./ or ../
      /^\/.*$/, // Absolute local paths: /path/to/file
      /^[A-Za-z]:[\\\/].*$/, // Windows absolute paths: C:\path\to\file
    ];

    // Check for forbidden local imports
    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Check if it is a local import
        const isLocalImport = localImportPatterns.some((localPattern) =>
          localPattern.test(importPath),
        );

        if (isLocalImport) {
          violations.push(`Local import detected: "${importPath}"`);
        }
      }
    }

    // === EXPORT VALIDATION ===
    // Regular expressions to match different export patterns
    const exportPatterns = [
      // All export patterns to detect any exports
      /export\s+(?:const|let|var|function|class|interface|type|enum|default)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      // Export declarations: export { name1, name2 }
      /export\s*\{\s*([^}]+)\s*\}/g,
      // Direct const/let/var exports: export const name = value
      /export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
    ];

    // Specific pattern for valid JavaScript function declarations
    const validFunctionPattern =
      /export\s+(?:async\s+)?function\s+(up|down)\s*\(/g;

    const allowedExports = new Set(["up", "down"]);
    const foundExports = new Set<string>();
    const validFunctionExports = new Set<string>();

    // Find valid function exports first
    let match;
    while ((match = validFunctionPattern.exec(content)) !== null) {
      validFunctionExports.add(match[1]);
    }

    // Find all exports
    for (const pattern of exportPatterns) {
      let exportMatch;
      while ((exportMatch = pattern.exec(content)) !== null) {
        if (pattern.source.includes("\\{")) {
          // Handle export { name1, name2 } syntax
          const exportList = exportMatch[1].split(",").map((name) =>
            name
              .trim()
              .split(/\s+as\s+/)[0]
              .trim(),
          );
          exportList.forEach((name) => foundExports.add(name));
        } else {
          // Handle other export patterns
          foundExports.add(exportMatch[1]);
        }
      }
    }

    // Check for export violations
    for (const exportName of foundExports) {
      if (!allowedExports.has(exportName)) {
        violations.push(`Forbidden export detected: "${exportName}"`);
      } else if (!validFunctionExports.has(exportName)) {
        // It is an allowed name but not a valid function declaration
        violations.push(
          `Invalid export format for "${exportName}" - must be a JavaScript function declaration`,
        );
      }
    }

    // Check for required exports
    const requiredExports = ["up"];
    const missingExports: string[] = [];

    for (const required of requiredExports) {
      if (!validFunctionExports.has(required)) {
        missingExports.push(required);
      }
    }

    // === ERROR REPORTING ===
    if (violations.length > 0 || missingExports.length > 0) {
      let errorMessage = `Migration file ${fileName} validation failed:\n`;

      if (violations.length > 0) {
        errorMessage += violations.map((v) => `  - ${v}`).join("\n") + "\n";
      }

      if (missingExports.length > 0) {
        errorMessage += `Missing required exports: ${missingExports.join(", ")}\n`;
      }

      errorMessage += `
Migration file requirements:
  IMPORTS: Only package imports allowed (no local imports like ./ or ../)
  EXPORTS: Only JavaScript function declarations allowed

Valid format:
  export async function up(client: PoolClient): Promise<void>
  export async function down(client: PoolClient): Promise<void> (optional)

Forbidden:
  Local imports: import { ... } from './localFile'
  Arrow functions: export const up = async (client) => { ... }
  Constants: export const myConstant = "value"
  Types/Interfaces: export interface MyInterface { ... }
  Classes/Enums: export class MyClass { ... }
`;

      throw new Error(errorMessage);
    }
  }

  /**
   * Load TypeScript/JavaScript migration files
   */
  private async loadTypeScriptMigration(filePath: string): Promise<any> {
    try {
      // Validate migration file before loading
      await this.validateMigrationFile(filePath);

      // For TypeScript files, we need to use a different approach
      // Since we're running with ts-node, we can use require() for .ts files
      if (filePath.endsWith(".ts")) {
        // Use require() for TypeScript files when running with ts-node
        const migration = require(filePath);
        return migration;
      } else {
        // For JavaScript files, use dynamic import
        const fileUrl = pathToFileURL(filePath).href;
        const migration = await import(fileUrl);
        return migration;
      }
    } catch (error) {
      logger.error(`Failed to load migration from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Prepare migration directory
   */
  private async getOrCreateMigrationDirectory(
    schemaFolderName: string,
  ): Promise<string> {
    const migrationDir = path.join(
      currentDir,
      `src/database/migrations/${schemaFolderName}`,
    );

    // Ensure migration directory exists
    await fs.mkdir(migrationDir, { recursive: true });

    return migrationDir;
  }

  /**
   * Setup database schema and table and get applied migrations
   */
  private async setupDBSchemaAndGetAppliedMigrations({
    client,
    schemaName,
  }: {
    client: Client;
    schemaName: string;
  }): Promise<AppliedMigration[]> {
    /* Ensure schema exists */
    await client.query(`
        CREATE SCHEMA IF NOT EXISTS ${schemaName};
        SET search_path TO ${schemaName};
      `);

    /* Ensure migration table exists */
    await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          version BIGINT PRIMARY KEY,
          name TEXT NOT NULL,
          md5 TEXT NOT NULL,
          run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

    const { rows: appliedMigrations } = (await client.query(
      `SELECT version, name, md5 FROM migrations ORDER BY version::int`,
    )) as { rows: AppliedMigration[] };

    return appliedMigrations;
  }

  /**
   * Get pending migrations
   */
  private async getPendingMigration({
    appliedMigrations,
    migrationDir,
  }: {
    appliedMigrations: AppliedMigration[];
    migrationDir: string;
  }): Promise<MigrationFile[]> {
    const migrationFiles = await fs.readdir(migrationDir);

    for (const fileName of migrationFiles) {
      this.validateMigrationFileName(fileName);
    }

    const allMigrations: MigrationFile[] = migrationFiles
      .map((name) => ({
        name,
        version: this.extractVersion(name),
        fullPath: path.join(migrationDir, name),
      }))
      .filter((m): m is MigrationFile => m.version !== null)
      .sort((a, b) => a.version - b.version);

    const appliedVersions = appliedMigrations.map((r) =>
      parseInt(r.version, 10),
    );
    const lastAppliedVersion = appliedVersions.at(-1) ?? 0;
    const expectedNextVersion = lastAppliedVersion + 1;

    const pendingMigrations = allMigrations.filter(
      (m) => !appliedVersions.includes(m.version),
    );

    // Prevent version skipping
    for (let i = 0; i < pendingMigrations.length; i++) {
      const expected = expectedNextVersion + i;
      if (pendingMigrations[i].version !== expected) {
        throw new Error(
          `Migration version mismatch: expected ${expected}, but got ${pendingMigrations[i].name}`,
        );
      }
    }

    return pendingMigrations;
  }

  /**
   * Run all migrations for a given schema
   */
  async runMigrationForSchema({
    schemaName,
    schemaFolderName,
  }: {
    schemaName: string;
    schemaFolderName: string;
  }): Promise<void> {
    const client = await db.getDbClient();

    const migrationDir =
      await this.getOrCreateMigrationDirectory(schemaFolderName);

    const appliedMigrations = await this.setupDBSchemaAndGetAppliedMigrations({
      client,
      schemaName,
    });

    const pendingMigrations = await this.getPendingMigration({
      appliedMigrations,
      migrationDir,
    });

    // Run migrations using Umzug
    const umzug = new Umzug({
      migrations: pendingMigrations.map(({ name, fullPath }) => ({
        name,
        path: fullPath,
        up: async () => {
          await client.query("BEGIN");
          // Wrap each migration file in a transaction
          try {
            if (name.endsWith(".sql")) {
              const sql = await fs.readFile(fullPath, "utf8");
              await client.query(sql);
            } else {
              // For TypeScript/JavaScript files, use our custom loader
              try {
                const migration =
                  await this.loadTypeScriptMigration(fullPath);
                if (migration.up && typeof migration.up === "function") {
                  await migration.up(client, schemaName);
                } else {
                  throw new Error(
                    `Migration file ${name} does not export an 'up' function`,
                  );
                }
              } catch (error) {
                logger.error(`Failed to import migration ${name}:`, error);
                throw new Error(`Failed to import migration ${name}: ${error}`);
              }
            }
            await client.query("COMMIT");
            logger.info(`Applied migration: ${name}`);
          } catch (error) {
            await client.query("ROLLBACK");
            logger.error(`Migration failed and rolled back: ${name}`, error);
            throw error;
          }
        },
      })),
      storage: {
        executed: async () => {
          /** Validate MD5 hashes for previously applied migrations */
          for (const row of appliedMigrations) {
            const { version, name: recordedName, md5: recordedMd5 } = row;
            const filePath = path.join(migrationDir, recordedName);
            try {
              const currentMd5 = await this.getFileMd5(filePath);
              if (currentMd5 !== recordedMd5) {
                throw new Error(
                  `MD5 mismatch in ${recordedName}. Was modified after applying.\nExpected: ${recordedMd5}, Found: ${currentMd5}`,
                );
              }
            } catch (error: any) {
              if (error.code === "ENOENT") {
                throw new Error(
                  `Applied migration missing: ${recordedName}`,
                );
              }
              throw error;
            }
          }
          return appliedMigrations.map((r) => r.name);
        },
        logMigration: async (migration: any) => {
          const { name, path: migrationPath } = migration;
          const version = this.extractVersion(name);
          if (version === null) return;

          const md5 = await this.getFileMd5(migrationPath);
          await client.query(
            `INSERT INTO migrations(version, name, md5) VALUES ($1, $2, $3)`,
            [version, name, md5],
          );
        },
        unlogMigration: async (migrationName: string | { name: string }) => {
          const name =
            typeof migrationName === "object"
              ? migrationName.name
              : migrationName;
          const version = this.extractVersion(name);
          if (version === null) return;

          await client.query(`DELETE FROM migrations WHERE version = $1`, [
            version.toString(),
          ]);
        },
      },
      logger: {
        info: (msg: any) => logger.info(msg),
        warn: (msg: any) => logger.warn(msg),
        error: (msg: any) => logger.error(msg),
        debug: (msg: any) => logger.debug(msg),
      },
    });

    await umzug.up();
    await client.query("COMMIT");
    await client.query(`RESET search_path`);
    logger.info(`Migrations completed for schema: ${schemaName}`);
  }

  /**
   * Main migration handler.
   * Skips public schema (managed by Prisma), then runs tenant migrations for all gyms.
   */
  public async handleMigration(): Promise<void> {
    try {
      // NOTE: Public schema migrations are handled by Prisma (prisma migrate deploy).
      // This migration system only handles tenant schemas.

      const client = await db.getDbClient();

      const { rows: gyms } = await client.query(
        `SELECT id, name FROM public.gyms`,
      );

      if (gyms.length === 0) {
        logger.info("No gyms found. Skipping tenant migrations.");
      }

      for (const gym of gyms) {
        const schemaName = schemaNames.tenantSchemaName(gym.id);
        try {
          logger.info(
            `Running migration for: (${schemaName}) ${gym.name} gym`,
          );
          await this.runMigrationForSchema({
            schemaName: schemaName,
            schemaFolderName: schemaNames.tenantSchemaFolderName(),
          });
        } catch (error) {
          logger.error(
            `Failed to migrate (${schemaName}) ${gym.name} gym. Skipping.`,
            error,
          );
        }
      }

      await db.shutdown();
      logger.info("All migrations completed");
    } catch (error) {
      logger.error("Migration process failed:", error);
    }
  }
}
