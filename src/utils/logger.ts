import pino from "pino";
import type { Env } from "../config/env";

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    level: env.LOG_LEVEL,
    base: undefined,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      remove: true
    },
    transport:
      env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname"
            }
          }
        : undefined
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
