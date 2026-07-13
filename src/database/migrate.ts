import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { env } from "../config/env";
import { createPgPool } from "./postgres";

const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

export async function runMigrations(
  pool: Pool,
  migrationsDir = DEFAULT_MIGRATIONS_DIR
): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const filenames = (await fs.readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of filenames) {
    const alreadyApplied = await pool.query(
      "select 1 from schema_migrations where filename = $1",
      [filename]
    );

    if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");

    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query(
        "insert into schema_migrations (filename) values ($1)",
        [filename]
      );
      await pool.query("commit");
      console.log(`Applied migration ${filename}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
}

async function main() {
  const pool = createPgPool(env);

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
