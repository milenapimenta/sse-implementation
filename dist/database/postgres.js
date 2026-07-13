"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostgresPool = getPostgresPool;
exports.closePostgresPool = closePostgresPool;
exports.getPostgresPoolMetrics = getPostgresPoolMetrics;
exports.checkPostgres = checkPostgres;
exports.waitForPostgres = waitForPostgres;
exports.resetPostgresPoolForTests = resetPostgresPoolForTests;
const pg_1 = require("pg");
const env_1 = require("../config/env");
const wait_1 = require("../utils/wait");
let poolInstance = null;
let poolClosingPromise = null;
let poolShuttingDown = false;
let postgresLogger = null;
function getPostgresPool(options = {}) {
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
    const config = options.env ?? env_1.env;
    const pool = new pg_1.Pool({
        connectionString: config.DATABASE_URL,
        max: config.DATABASE_POOL_MAX,
        idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS
    });
    installPoolListeners(pool);
    poolInstance = pool;
    postgresLogger?.info({ component: "postgres", max: config.DATABASE_POOL_MAX }, "postgres pool created");
    return pool;
}
async function closePostgresPool() {
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
function getPostgresPoolMetrics() {
    const pool = poolInstance;
    return {
        totalConnections: pool?.totalCount ?? 0,
        idleConnections: pool?.idleCount ?? 0,
        waitingRequests: pool?.waitingCount ?? 0
    };
}
async function checkPostgres(pool = getPostgresPool(), timeoutMs = env_1.env.DATABASE_CONNECTION_TIMEOUT_MS) {
    await withTimeout(pool.query("select 1").then(() => undefined), timeoutMs, "PostgreSQL health check timed out");
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
async function resetPostgresPoolForTests() {
    const pool = poolInstance;
    poolInstance = null;
    poolClosingPromise = null;
    poolShuttingDown = false;
    postgresLogger = null;
    if (pool) {
        await pool.end();
    }
}
function installPoolListeners(pool) {
    pool.on("connect", () => {
        postgresLogger?.debug({ component: "postgres" }, "postgres client connected");
    });
    pool.on("error", (error) => {
        postgresLogger?.error({ err: error }, "postgres pool error");
    });
}
function withTimeout(promise, timeoutMs, message) {
    let timeout;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) {
            clearTimeout(timeout);
        }
    });
}
//# sourceMappingURL=postgres.js.map