"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.loadEnv = loadEnv;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    DATABASE_URL: zod_1.z
        .string()
        .url()
        .default("postgresql://postgres:postgres@localhost:5432/notifications"),
    REDIS_URL: zod_1.z.string().url().default("redis://localhost:6379"),
    SSE_HEARTBEAT_INTERVAL_MS: zod_1.z.coerce.number().int().positive().default(15000),
    SSE_RETRY_MS: zod_1.z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: zod_1.z
        .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
        .default("info"),
    CORS_ORIGIN: zod_1.z.string().default("*")
});
function loadEnv(source = process.env) {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
        throw new Error(`Invalid environment variables: ${details}`);
    }
    return parsed.data;
}
exports.env = loadEnv();
//# sourceMappingURL=env.js.map