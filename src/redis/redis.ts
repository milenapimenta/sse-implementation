import Redis, { type RedisOptions } from "ioredis";
import { env as defaultEnv, type Env } from "../config/env";
import type { Notification } from "../modules/notifications/notification.types";
import type { SseManager } from "../sse/sse-manager";
import type { AppLogger } from "../utils/logger";

export const NOTIFICATIONS_CHANNEL = "notifications";

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

const clients: Record<RedisClientRole, Redis | null> = {
  command: null,
  publisher: null,
  subscriber: null
};

const connectPromises: Record<RedisClientRole, Promise<void> | null> = {
  command: null,
  publisher: null,
  subscriber: null
};

let closePromise: Promise<void> | null = null;
let redisShuttingDown = false;
let redisLogger: AppLogger | null = null;
let notificationSubscriberInitialized = false;
let notificationSubscriberInitializationPromise: Promise<void> | null = null;
let notificationMessageHandler:
  | ((channel: string, payload: string) => void)
  | null = null;

export function getRedisClient(options: RedisClientOptions = {}): Redis {
  return getRedisClientByRole("command", options);
}

export function getRedisPublisher(options: RedisClientOptions = {}): Redis {
  return getRedisClientByRole("publisher", options);
}

export function getRedisSubscriber(options: RedisClientOptions = {}): Redis {
  return getRedisClientByRole("subscriber", options);
}

export function getRedisClients(options: RedisClientOptions = {}): RedisClients {
  return {
    general: getRedisClient(options),
    publisher: getRedisPublisher(options),
    subscriber: getRedisSubscriber(options)
  };
}

export async function connectRedisClient(
  role: RedisClientRole,
  options: RedisClientOptions = {}
): Promise<void> {
  await connectClient(role, getRedisClientByRole(role, options));
}

export async function connectRedisClients(
  options: RedisClientOptions = {}
): Promise<void> {
  await Promise.all([
    connectRedisClient("command", options),
    connectRedisClient("publisher", options),
    connectRedisClient("subscriber", options)
  ]);
}

export async function checkRedis(
  redis = getRedisClient(),
  timeoutMs = defaultEnv.DATABASE_CONNECTION_TIMEOUT_MS
): Promise<void> {
  await withTimeout(
    redis.ping().then(() => undefined),
    timeoutMs,
    "Redis health check timed out"
  );
}

export async function initializeNotificationSubscriber(
  options: NotificationSubscriberOptions
): Promise<void> {
  if (redisShuttingDown) {
    throw new Error("Redis client manager is shutting down");
  }

  if (options.logger) {
    redisLogger = options.logger;
  }

  if (notificationSubscriberInitialized) {
    redisLogger?.debug(
      { component: "redis", redisRole: "subscriber" },
      "redis subscription reused"
    );
    return;
  }

  if (notificationSubscriberInitializationPromise) {
    return notificationSubscriberInitializationPromise;
  }

  const subscriber = getRedisSubscriber(options);
  const handler = createNotificationMessageHandler(
    options.sseManager,
    options.logger ?? redisLogger
  );

  notificationMessageHandler = handler;
  subscriber.on("message", handler);

  notificationSubscriberInitializationPromise = (async () => {
    try {
      await connectClient("subscriber", subscriber);
      await subscriber.subscribe(NOTIFICATIONS_CHANNEL);
      notificationSubscriberInitialized = true;
      redisLogger?.info(
        { component: "redis", channel: NOTIFICATIONS_CHANNEL },
        "redis subscriber initialized"
      );
    } catch (error) {
      subscriber.off("message", handler);
      notificationMessageHandler = null;
      throw error;
    }
  })().finally(() => {
    notificationSubscriberInitializationPromise = null;
  });

  return notificationSubscriberInitializationPromise;
}

export async function closeRedisClients(): Promise<void> {
  redisShuttingDown = true;

  if (closePromise) {
    return closePromise;
  }

  const clientsToClose = {
    command: clients.command,
    publisher: clients.publisher,
    subscriber: clients.subscriber
  };

  clients.command = null;
  clients.publisher = null;
  clients.subscriber = null;

  redisLogger?.info({ component: "redis" }, "redis clients closing");

  closePromise = (async () => {
    await removeNotificationSubscription(clientsToClose.subscriber);
    await Promise.allSettled([
      closeRedisClient(clientsToClose.subscriber, "subscriber"),
      closeRedisClient(clientsToClose.publisher, "publisher"),
      closeRedisClient(clientsToClose.command, "command")
    ]);

    redisLogger?.info({ component: "redis" }, "redis clients closed");
  })().finally(() => {
    closePromise = null;
    connectPromises.command = null;
    connectPromises.publisher = null;
    connectPromises.subscriber = null;
  });

  return closePromise;
}

export function getRedisStatusMetrics(): RedisStatusMetrics {
  return {
    command: clients.command?.status ?? "not_created",
    publisher: clients.publisher?.status ?? "not_created",
    subscriber: clients.subscriber?.status ?? "not_created"
  };
}

export async function resetRedisClientsForTests(): Promise<void> {
  const clientsToReset = [
    clients.subscriber,
    clients.publisher,
    clients.command
  ].filter((client): client is Redis => Boolean(client));

  if (clients.subscriber && notificationMessageHandler) {
    clients.subscriber.off("message", notificationMessageHandler);
  }

  clients.command = null;
  clients.publisher = null;
  clients.subscriber = null;
  connectPromises.command = null;
  connectPromises.publisher = null;
  connectPromises.subscriber = null;
  closePromise = null;
  redisShuttingDown = false;
  redisLogger = null;
  notificationSubscriberInitialized = false;
  notificationSubscriberInitializationPromise = null;
  notificationMessageHandler = null;

  for (const client of clientsToReset) {
    client.disconnect();
  }
}

function getRedisClientByRole(
  role: RedisClientRole,
  options: RedisClientOptions
): Redis {
  if (options.logger) {
    redisLogger = options.logger;
  }

  if (redisShuttingDown) {
    throw new Error("Redis client manager is shutting down");
  }

  const existing = clients[role];

  if (existing) {
    redisLogger?.debug({ component: "redis", redisRole: role }, "redis client reused");
    return existing;
  }

  const config = options.env ?? defaultEnv;
  const client = new Redis(config.REDIS_URL, createRedisOptions());

  clients[role] = client;
  installRedisListeners(client, role);
  redisLogger?.info(
    { component: "redis", redisRole: role },
    "redis client created"
  );

  return client;
}

function createRedisOptions(): RedisOptions {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    }
  };
}

async function connectClient(
  role: RedisClientRole,
  client: Redis
): Promise<void> {
  if (client.status === "ready" || client.status === "connect") {
    return;
  }

  if (connectPromises[role]) {
    return connectPromises[role];
  }

  connectPromises[role] = client.connect().then(() => undefined).finally(() => {
    connectPromises[role] = null;
  });

  return connectPromises[role];
}

function installRedisListeners(client: Redis, role: RedisClientRole): void {
  client.on("connect", () => {
    redisLogger?.debug(
      { component: "redis", redisRole: role },
      "redis client connected"
    );
  });

  client.on("ready", () => {
    redisLogger?.info(
      { component: "redis", redisRole: role },
      "redis client ready"
    );
  });

  client.on("reconnecting", () => {
    redisLogger?.warn(
      { component: "redis", redisRole: role },
      "redis client reconnecting"
    );
  });

  client.on("close", () => {
    redisLogger?.warn(
      { component: "redis", redisRole: role },
      "redis client closed"
    );
  });

  client.on("end", () => {
    redisLogger?.info(
      { component: "redis", redisRole: role },
      "redis client ended"
    );
  });

  client.on("error", (error) => {
    redisLogger?.error(
      { err: error, component: "redis", redisRole: role },
      "redis client error"
    );
  });
}

function createNotificationMessageHandler(
  sseManager: SseManager,
  logger: AppLogger | null
) {
  return (channel: string, payload: string): void => {
    if (channel !== NOTIFICATIONS_CHANNEL) {
      return;
    }

    try {
      const message = JSON.parse(payload) as NotificationCreatedMessage;

      if (message.event !== "notification.created") {
        return;
      }

      logger?.info(
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
      logger?.error({ err: error, channel }, "failed to process redis message");
    }
  };
}

async function removeNotificationSubscription(
  subscriber: Redis | null
): Promise<void> {
  if (!subscriber) {
    resetNotificationSubscriberState();
    return;
  }

  if (notificationMessageHandler) {
    subscriber.off("message", notificationMessageHandler);
  }

  if (notificationSubscriberInitialized && subscriber.status !== "end") {
    try {
      await withTimeout(
        subscriber.unsubscribe(NOTIFICATIONS_CHANNEL).then(() => undefined),
        defaultEnv.DATABASE_CONNECTION_TIMEOUT_MS,
        "Redis unsubscribe timed out"
      );
    } catch (error) {
      redisLogger?.warn(
        { err: error, component: "redis", redisRole: "subscriber" },
        "redis unsubscribe failed"
      );
    }
  }

  resetNotificationSubscriberState();
}

function resetNotificationSubscriberState(): void {
  notificationSubscriberInitialized = false;
  notificationSubscriberInitializationPromise = null;
  notificationMessageHandler = null;
}

async function closeRedisClient(
  client: Redis | null,
  role: RedisClientRole
): Promise<void> {
  if (!client || client.status === "end") {
    return;
  }

  if (client.status === "wait") {
    client.disconnect();
    return;
  }

  try {
    await withTimeout(
      client.quit().then(() => undefined),
      defaultEnv.DATABASE_CONNECTION_TIMEOUT_MS,
      `Redis ${role} client shutdown timed out`
    );
  } catch (error) {
    redisLogger?.warn(
      { err: error, component: "redis", redisRole: role },
      "redis graceful shutdown failed; disconnecting"
    );
    client.disconnect();
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
