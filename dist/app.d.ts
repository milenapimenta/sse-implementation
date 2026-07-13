import { type Router } from "express";
import type { Env } from "./config/env";
import type { SseManager } from "./sse/sse-manager";
import type { AppLogger } from "./utils/logger";
export interface HealthChecks {
    postgres: () => Promise<void>;
    redis: () => Promise<void>;
}
export declare function createApp(options: {
    env: Env;
    logger: AppLogger;
    notificationRoutes: Router;
    sseManager: SseManager;
    healthChecks: HealthChecks;
}): import("express-serve-static-core").Express;
