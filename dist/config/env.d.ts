import "dotenv/config";
import { z } from "zod";
declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    PORT: z.ZodDefault<z.ZodNumber>;
    DATABASE_URL: z.ZodDefault<z.ZodString>;
    REDIS_URL: z.ZodDefault<z.ZodString>;
    SSE_HEARTBEAT_INTERVAL_MS: z.ZodDefault<z.ZodNumber>;
    SSE_RETRY_MS: z.ZodDefault<z.ZodNumber>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<["trace", "debug", "info", "warn", "error", "fatal", "silent"]>>;
    CORS_ORIGIN: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    DATABASE_URL: string;
    REDIS_URL: string;
    SSE_HEARTBEAT_INTERVAL_MS: number;
    SSE_RETRY_MS: number;
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
    CORS_ORIGIN: string;
}, {
    NODE_ENV?: "development" | "test" | "production" | undefined;
    PORT?: number | undefined;
    DATABASE_URL?: string | undefined;
    REDIS_URL?: string | undefined;
    SSE_HEARTBEAT_INTERVAL_MS?: number | undefined;
    SSE_RETRY_MS?: number | undefined;
    LOG_LEVEL?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent" | undefined;
    CORS_ORIGIN?: string | undefined;
}>;
export type Env = z.infer<typeof envSchema>;
export declare function loadEnv(source?: NodeJS.ProcessEnv): Env;
export declare const env: {
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    DATABASE_URL: string;
    REDIS_URL: string;
    SSE_HEARTBEAT_INTERVAL_MS: number;
    SSE_RETRY_MS: number;
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
    CORS_ORIGIN: string;
};
export {};
