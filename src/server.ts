import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { checkPostgres, createPgPool, waitForPostgres } from "./database/postgres";
import { NotificationController } from "./modules/notifications/notification.controller";
import { NotificationRepository } from "./modules/notifications/notification.repository";
import { createNotificationRoutes } from "./modules/notifications/notification.routes";
import { NotificationService } from "./modules/notifications/notification.service";
import {
  closeRedisClients,
  createRedisClients,
  subscribeToNotifications,
  waitForRedis
} from "./redis/redis";
import { createSseHandler } from "./sse/sse-handler";
import { SseManager } from "./sse/sse-manager";
import { createLogger } from "./utils/logger";
import { wait } from "./utils/wait";

const logger = createLogger(env);

async function main(): Promise<void> {
  const pool = createPgPool(env);
  const redisClients = createRedisClients(env);

  pool.on("error", (error) => {
    logger.error({ err: error }, "postgres pool error");
  });

  for (const [name, client] of Object.entries(redisClients)) {
    client.on("error", (error: Error) => {
      logger.error({ err: error, client: name }, "redis client error");
    });
  }

  await waitForPostgres(pool, logger);
  await waitForRedis(redisClients.general, logger);
  await Promise.all([
    redisClients.publisher.connect(),
    redisClients.subscriber.connect()
  ]);

  const repository = new NotificationRepository(pool);
  const sseManager = new SseManager(logger);
  const service = new NotificationService(
    repository,
    redisClients.publisher,
    logger
  );
  const controller = new NotificationController(service, logger);
  const sseHandler = createSseHandler({
    sseManager,
    notificationRepository: repository,
    heartbeatIntervalMs: env.SSE_HEARTBEAT_INTERVAL_MS,
    retryMs: env.SSE_RETRY_MS,
    logger
  });

  await subscribeToNotifications({
    subscriber: redisClients.subscriber,
    sseManager,
    logger
  });

  const app = createApp({
    env,
    logger,
    notificationRoutes: createNotificationRoutes({ controller, sseHandler }),
    sseManager,
    healthChecks: {
      postgres: () => checkPostgres(pool),
      redis: () => redisClients.general.ping().then(() => undefined)
    }
  });

  const server = http.createServer(app);
  server.timeout = 0;
  server.requestTimeout = 0;
  server.keepAliveTimeout = 65000;

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => resolve());
  });

  logger.info({ port: env.PORT }, "api started");

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown started");

    const closeServer = new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    sseManager.closeAll({
      event: "shutdown",
      data: { reason: "server_shutdown" }
    });

    await Promise.race([closeServer, wait(5000)]);
    await closeRedisClients(redisClients);
    await pool.end();

    logger.info("graceful shutdown finished");
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").then(() => process.exit(0));
  });
}

void main().catch((error) => {
  logger.fatal({ err: error }, "failed to start api");
  process.exit(1);
});
