import { Pool } from "pg";
import type { Env } from "../config/env";
import type { AppLogger } from "../utils/logger";
export declare function createPgPool(env: Pick<Env, "DATABASE_URL">): Pool;
export declare function checkPostgres(pool: Pool): Promise<void>;
export declare function waitForPostgres(pool: Pool, logger: AppLogger, attempts?: number): Promise<void>;
