import pino from "pino";
import type { Env } from "../config/env";
export declare function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): pino.Logger<never, boolean>;
export type AppLogger = ReturnType<typeof createLogger>;
