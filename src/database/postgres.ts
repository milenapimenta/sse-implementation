import { Pool } from "pg";
import { env as defaultEnv, type Env } from "../config/env";
import type { AppLogger } from "../utils/logger";
import { wait } from "../utils/wait";

type PostgresConfig = Pick<
  Env,
  | "DATABASE_URL"
  | "DATABASE_POOL_MAX"
  | "DATABASE_IDLE_TIMEOUT_MS"
  | "DATABASE_CONNECTION_TIMEOUT_MS"
>;

interface PostgresPoolOptions {
  env?: PostgresConfig;
  logger?: AppLogger;
}

export interface PostgresPoolMetrics {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

let poolInstance: Pool | null = null;
let poolClosingPromise: Promise<void> | null = null;
let poolShuttingDown = false;
let postgresLogger: AppLogger | null = null;

export function getPostgresPool(options: PostgresPoolOptions = {}): Pool {
  if (options.logger) {
    postgresLogger = options.logger;
  }

  if (poolShuttingDown) {
    throw new Error("PostgreSQL pool manager is shutting down");
  }

  if (poolInstance) {
    postgresLogger?.debug({ component: "postgres" }, "postgres pool reused");
    return poolInstance;
  }

  const config = options.env ?? defaultEnv;
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS
  });

  installPoolListeners(pool);
  poolInstance = pool;
  postgresLogger?.info(
    { component: "postgres", max: config.DATABASE_POOL_MAX },
    "postgres pool created"
  );

  return pool;
}

export async function closePostgresPool(): Promise<void> {
  poolShuttingDown = true;

  if (poolClosingPromise) {
    return poolClosingPromise;
  }

  const pool = poolInstance;
  poolInstance = null;

  if (!pool) {
    return;
  }

  postgresLogger?.info({ component: "postgres" }, "postgres pool closing");

  poolClosingPromise = pool.end().finally(() => {
    poolClosingPromise = null;
    postgresLogger?.info({ component: "postgres" }, "postgres pool closed");
  });

  return poolClosingPromise;
}

export function getPostgresPoolMetrics(): PostgresPoolMetrics {
  const pool = poolInstance;

  return {
    totalConnections: pool?.totalCount ?? 0,
    idleConnections: pool?.idleCount ?? 0,
    waitingRequests: pool?.waitingCount ?? 0
  };
}

export async function checkPostgres(
  pool = getPostgresPool(),
  timeoutMs = defaultEnv.DATABASE_CONNECTION_TIMEOUT_MS
): Promise<void> {
  await withTimeout(
    pool.query("select 1").then(() => undefined),
    timeoutMs,
    "PostgreSQL health check timed out"
  );
}

export async function waitForPostgres(
  pool: Pool,
  logger: AppLogger,
  attempts = 30
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkPostgres(pool);
      logger.info({ component: "postgres" }, "postgres connected");
      return;
    } catch (error) {
      logger.warn(
        { component: "postgres", attempt, err: error },
        "postgres connection failed"
      );
      await wait(1000);
    }
  }

  throw new Error("Postgres did not become available in time");
}

export async function resetPostgresPoolForTests(): Promise<void> {
  const pool = poolInstance;

  poolInstance = null;
  poolClosingPromise = null;
  poolShuttingDown = false;
  postgresLogger = null;

  if (pool) {
    await pool.end();
  }
}

function installPoolListeners(pool: Pool): void {
  pool.on("connect", () => {
    postgresLogger?.debug(
      { component: "postgres" },
      "postgres client connected"
    );
  });

  pool.on("error", (error) => {
    postgresLogger?.error({ err: error }, "postgres pool error");
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
