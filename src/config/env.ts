import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/notifications"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  SSE_RETRY_MS: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().default("*")
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment variables: ${details}`);
  }

  return parsed.data;
}

export const env = loadEnv();
