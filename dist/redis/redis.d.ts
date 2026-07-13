import Redis from "ioredis";
import { type Env } from "../config/env";
import type { Notification } from "../modules/notifications/notification.types";
import type { SseManager } from "../sse/sse-manager";
import type { AppLogger } from "../utils/logger";
export declare const NOTIFICATIONS_CHANNEL = "notifications";
export type RedisClientRole = "command" | "publisher" | "subscriber";
export interface RedisClients {
    general: Redis;
    publisher: Redis;
    subscriber: Redis;
}
export interface RedisStatusMetrics {
    command: string;
    publisher: string;
    subscriber: string;
}
export interface NotificationCreatedMessage {
    event: "notification.created";
    notification: Notification;
}
type RedisConfig = Pick<Env, "REDIS_URL">;
interface RedisClientOptions {
    env?: RedisConfig;
    logger?: AppLogger;
}
interface NotificationSubscriberOptions extends RedisClientOptions {
    sseManager: SseManager;
}
export declare function getRedisClient(options?: RedisClientOptions): Redis;
export declare function getRedisPublisher(options?: RedisClientOptions): Redis;
export declare function getRedisSubscriber(options?: RedisClientOptions): Redis;
export declare function getRedisClients(options?: RedisClientOptions): RedisClients;
export declare function connectRedisClient(role: RedisClientRole, options?: RedisClientOptions): Promise<void>;
export declare function connectRedisClients(options?: RedisClientOptions): Promise<void>;
export declare function checkRedis(redis?: Redis, timeoutMs?: number): Promise<void>;
export declare function initializeNotificationSubscriber(options: NotificationSubscriberOptions): Promise<void>;
export declare function closeRedisClients(): Promise<void>;
export declare function getRedisStatusMetrics(): RedisStatusMetrics;
export declare function resetRedisClientsForTests(): Promise<void>;
export {};
