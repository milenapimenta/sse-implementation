import Redis from "ioredis";
import type { Env } from "../config/env";
import type { Notification } from "../modules/notifications/notification.types";
import type { SseManager } from "../sse/sse-manager";
import type { AppLogger } from "../utils/logger";
import { wait } from "../utils/wait";

export const NOTIFICATIONS_CHANNEL = "notifications";

export interface RedisClients {
  publisher: Redis;
  subscriber: Redis;
  general: Redis;
}

export interface NotificationCreatedMessage {
  event: "notification.created";
  notification: Notification;
}

export function createRedisClients(env: Pick<Env, "REDIS_URL">): RedisClients {
  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true
  };

  return {
    publisher: new Redis(env.REDIS_URL, options),
    subscriber: new Redis(env.REDIS_URL, options),
    general: new Redis(env.REDIS_URL, options)
  };
}

export async function connectRedisClients(
  clients: RedisClients
): Promise<void> {
  await Promise.all([
    clients.publisher.connect(),
    clients.subscriber.connect(),
    clients.general.connect()
  ]);
}

export async function waitForRedis(
  redis: Redis,
  logger: AppLogger,
  attempts = 30
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await redis.ping();
      logger.info({ component: "redis" }, "redis connected");
      return;
    } catch (error) {
      logger.warn(
        { component: "redis", attempt, err: error },
        "redis connection failed"
      );
      await wait(1000);
    }
  }

  throw new Error("Redis did not become available in time");
}

export async function subscribeToNotifications(options: {
  subscriber: Redis;
  sseManager: SseManager;
  logger: AppLogger;
}): Promise<void> {
  const { subscriber, sseManager, logger } = options;

  subscriber.on("message", (channel, payload) => {
    if (channel !== NOTIFICATIONS_CHANNEL) {
      return;
    }

    try {
      const message = JSON.parse(payload) as NotificationCreatedMessage;

      if (message.event !== "notification.created") {
        return;
      }

      logger.info(
        {
          channel,
          notificationId: message.notification.id,
          userId: message.notification.userId
        },
        "notification event received from redis"
      );

      sseManager.sendToUser(message.notification.userId, {
        id: message.notification.id,
        event: "notification",
        data: message.notification
      });
    } catch (error) {
      logger.error({ err: error, channel }, "failed to process redis message");
    }
  });

  await subscriber.subscribe(NOTIFICATIONS_CHANNEL);
}

export async function closeRedisClients(clients: RedisClients): Promise<void> {
  await Promise.allSettled([
    clients.publisher.quit(),
    clients.subscriber.quit(),
    clients.general.quit()
  ]);
}
