import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import {
  checkPostgres,
  closePostgresPool,
  getPostgresPool,
  getPostgresPoolMetrics,
  waitForPostgres
} from "./database/postgres";
import { registerGracefulShutdown } from "./lifecycle/shutdown";
import { NotificationController } from "./modules/notifications/notification.controller";
import { NotificationRepository } from "./modules/notifications/notification.repository";
import { createNotificationRoutes } from "./modules/notifications/notification.routes";
import { NotificationService } from "./modules/notifications/notification.service";
import {
  checkRedis,
  closeRedisClients,
  connectRedisClient,
  getRedisClients,
  getRedisStatusMetrics,
  initializeNotificationSubscriber
} from "./redis/redis";
import { createSseHandler } from "./sse/sse-handler";
import { SseManager } from "./sse/sse-manager";
import { createLogger } from "./utils/logger";

const logger = createLogger(env);

async function main(): Promise<void> {
  const pool = getPostgresPool({ env, logger });
  const redisClients = getRedisClients({ env, logger });

  await waitForPostgres(pool, logger);
  await connectRedisClient("command", { env, logger });
  await connectRedisClient("publisher", { env, logger });
  await checkRedis(redisClients.general);

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

  await initializeNotificationSubscriber({
    env,
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
      redis: () => checkRedis(redisClients.general)
    },
    resourceMetrics: () => ({
      postgres: getPostgresPoolMetrics(),
      redis: getRedisStatusMetrics()
    })
  });

  const server = http.createServer(app);
  server.timeout = 0;
  server.requestTimeout = 0;
  server.keepAliveTimeout = 65000;

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => resolve());
  });

  logger.info({ port: env.PORT }, "api started");

  registerGracefulShutdown({
    server,
    sseManager,
    logger,
    closeRedisClients,
    closePostgresPool
  });
}

void main().catch((error) => {
  logger.fatal({ err: error }, "failed to start api");
  process.exit(1);
});
