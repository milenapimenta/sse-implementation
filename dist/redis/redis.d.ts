import Redis from "ioredis";
import type { Env } from "../config/env";
import type { Notification } from "../modules/notifications/notification.types";
import type { SseManager } from "../sse/sse-manager";
import type { AppLogger } from "../utils/logger";
export declare const NOTIFICATIONS_CHANNEL = "notifications";
export interface RedisClients {
    publisher: Redis;
    subscriber: Redis;
    general: Redis;
}
export interface NotificationCreatedMessage {
    event: "notification.created";
    notification: Notification;
}
export declare function createRedisClients(env: Pick<Env, "REDIS_URL">): RedisClients;
export declare function connectRedisClients(clients: RedisClients): Promise<void>;
export declare function waitForRedis(redis: Redis, logger: AppLogger, attempts?: number): Promise<void>;
export declare function subscribeToNotifications(options: {
    subscriber: Redis;
    sseManager: SseManager;
    logger: AppLogger;
}): Promise<void>;
export declare function closeRedisClients(clients: RedisClients): Promise<void>;
