import type { Pool } from "pg";
export declare function runMigrations(pool: Pool, migrationsDir?: string): Promise<void>;
