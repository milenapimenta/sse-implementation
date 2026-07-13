"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
const postgres_1 = require("./postgres");
const DEFAULT_MIGRATIONS_DIR = node_path_1.default.resolve(process.cwd(), "migrations");
async function runMigrations(pool, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
    await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
    const filenames = (await promises_1.default.readdir(migrationsDir))
        .filter((filename) => filename.endsWith(".sql"))
        .sort();
    for (const filename of filenames) {
        const alreadyApplied = await pool.query("select 1 from schema_migrations where filename = $1", [filename]);
        if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
            continue;
        }
        const sql = await promises_1.default.readFile(node_path_1.default.join(migrationsDir, filename), "utf8");
        await pool.query("begin");
        try {
            await pool.query(sql);
            await pool.query("insert into schema_migrations (filename) values ($1)", [filename]);
            await pool.query("commit");
            console.log(`Applied migration ${filename}`);
        }
        catch (error) {
            await pool.query("rollback");
            throw error;
        }
    }
}
async function main() {
    const pool = (0, postgres_1.createPgPool)(env_1.env);
    try {
        await runMigrations(pool);
    }
    finally {
        await pool.end();
    }
}
if (require.main === module) {
    void main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map