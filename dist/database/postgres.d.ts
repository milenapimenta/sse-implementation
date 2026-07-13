import { Pool } from "pg";
import { type Env } from "../config/env";
import type { AppLogger } from "../utils/logger";
type PostgresConfig = Pick<Env, "DATABASE_URL" | "DATABASE_POOL_MAX" | "DATABASE_IDLE_TIMEOUT_MS" | "DATABASE_CONNECTION_TIMEOUT_MS">;
interface PostgresPoolOptions {
    env?: PostgresConfig;
    logger?: AppLogger;
}
export interface PostgresPoolMetrics {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
}
export declare function getPostgresPool(options?: PostgresPoolOptions): Pool;
export declare function closePostgresPool(): Promise<void>;
export declare function getPostgresPoolMetrics(): PostgresPoolMetrics;
export declare function checkPostgres(pool?: Pool, timeoutMs?: number): Promise<void>;
export declare function waitForPostgres(pool: Pool, logger: AppLogger, attempts?: number): Promise<void>;
export declare function resetPostgresPoolForTests(): Promise<void>;
export {};
