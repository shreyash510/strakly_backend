// Prisma configuration for Strakly
// Supports ENVIRONMENT=dev|prod switching
import "dotenv/config";
import { defineConfig } from "prisma/config";

const env = process.env.ENVIRONMENT || "dev";

// Select database URL based on environment
const getDatabaseUrl = (): string => {
  if (env === "prod") {
    return process.env.DIRECT_URL_PROD || process.env.DIRECT_URL || "";
  }
  return process.env.DIRECT_URL || process.env.DIRECT_URL_DEV || "";
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx ts-node prisma/seed.ts",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
