"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPgPool = createPgPool;
exports.checkPostgres = checkPostgres;
exports.waitForPostgres = waitForPostgres;
const pg_1 = require("pg");
const wait_1 = require("../utils/wait");
function createPgPool(env) {
    return new pg_1.Pool({
        connectionString: env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });
}
async function checkPostgres(pool) {
    await pool.query("select 1");
}
async function waitForPostgres(pool, logger, attempts = 30) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await checkPostgres(pool);
            logger.info({ component: "postgres" }, "postgres connected");
            return;
        }
        catch (error) {
            logger.warn({ component: "postgres", attempt, err: error }, "postgres connection failed");
            await (0, wait_1.wait)(1000);
        }
    }
    throw new Error("Postgres did not become available in time");
}
//# sourceMappingURL=postgres.js.map