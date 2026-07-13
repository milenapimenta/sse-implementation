import { Pool } from "pg";
import type { Env } from "../config/env";
import type { AppLogger } from "../utils/logger";
import { wait } from "../utils/wait";

export function createPgPool(env: Pick<Env, "DATABASE_URL">): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
}

export async function checkPostgres(pool: Pool): Promise<void> {
  await pool.query("select 1");
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
