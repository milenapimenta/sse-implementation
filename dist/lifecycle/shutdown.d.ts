import type http from "node:http";
import type { SseManager } from "../sse/sse-manager";
import type { AppLogger } from "../utils/logger";
export interface GracefulShutdownOptions {
    server: http.Server;
    sseManager: SseManager;
    logger: AppLogger;
    closeRedisClients: () => Promise<void>;
    closePostgresPool: () => Promise<void>;
    timeoutMs?: number;
}
export declare function registerGracefulShutdown(options: GracefulShutdownOptions): void;
