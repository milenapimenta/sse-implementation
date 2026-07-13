"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const app_1 = require("./app");
const env_1 = require("./config/env");
const postgres_1 = require("./database/postgres");
const shutdown_1 = require("./lifecycle/shutdown");
const notification_controller_1 = require("./modules/notifications/notification.controller");
const notification_repository_1 = require("./modules/notifications/notification.repository");
const notification_routes_1 = require("./modules/notifications/notification.routes");
const notification_service_1 = require("./modules/notifications/notification.service");
const redis_1 = require("./redis/redis");
const sse_handler_1 = require("./sse/sse-handler");
const sse_manager_1 = require("./sse/sse-manager");
const logger_1 = require("./utils/logger");
const logger = (0, logger_1.createLogger)(env_1.env);
async function main() {
    const pool = (0, postgres_1.getPostgresPool)({ env: env_1.env, logger });
    const redisClients = (0, redis_1.getRedisClients)({ env: env_1.env, logger });
    await (0, postgres_1.waitForPostgres)(pool, logger);
    await (0, redis_1.connectRedisClient)("command", { env: env_1.env, logger });
    await (0, redis_1.connectRedisClient)("publisher", { env: env_1.env, logger });
    await (0, redis_1.checkRedis)(redisClients.general);
    const repository = new notification_repository_1.NotificationRepository(pool);
    const sseManager = new sse_manager_1.SseManager(logger);
    const service = new notification_service_1.NotificationService(repository, redisClients.publisher, logger);
    const controller = new notification_controller_1.NotificationController(service, logger);
    const sseHandler = (0, sse_handler_1.createSseHandler)({
        sseManager,
        notificationRepository: repository,
        heartbeatIntervalMs: env_1.env.SSE_HEARTBEAT_INTERVAL_MS,
        retryMs: env_1.env.SSE_RETRY_MS,
        logger
    });
    await (0, redis_1.initializeNotificationSubscriber)({
        env: env_1.env,
        sseManager,
        logger
    });
    const app = (0, app_1.createApp)({
        env: env_1.env,
        logger,
        notificationRoutes: (0, notification_routes_1.createNotificationRoutes)({ controller, sseHandler }),
        sseManager,
        healthChecks: {
            postgres: () => (0, postgres_1.checkPostgres)(pool),
            redis: () => (0, redis_1.checkRedis)(redisClients.general)
        },
        resourceMetrics: () => ({
            postgres: (0, postgres_1.getPostgresPoolMetrics)(),
            redis: (0, redis_1.getRedisStatusMetrics)()
        })
    });
    const server = node_http_1.default.createServer(app);
    server.timeout = 0;
    server.requestTimeout = 0;
    server.keepAliveTimeout = 65000;
    await new Promise((resolve) => {
        server.listen(env_1.env.PORT, () => resolve());
    });
    logger.info({ port: env_1.env.PORT }, "api started");
    (0, shutdown_1.registerGracefulShutdown)({
        server,
        sseManager,
        logger,
        closeRedisClients: redis_1.closeRedisClients,
        closePostgresPool: postgres_1.closePostgresPool
    });
}
void main().catch((error) => {
    logger.fatal({ err: error }, "failed to start api");
    process.exit(1);
});
//# sourceMappingURL=server.js.map