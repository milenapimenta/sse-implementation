"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATIONS_CHANNEL = void 0;
exports.createRedisClients = createRedisClients;
exports.connectRedisClients = connectRedisClients;
exports.waitForRedis = waitForRedis;
exports.subscribeToNotifications = subscribeToNotifications;
exports.closeRedisClients = closeRedisClients;
const ioredis_1 = __importDefault(require("ioredis"));
const wait_1 = require("../utils/wait");
exports.NOTIFICATIONS_CHANNEL = "notifications";
function createRedisClients(env) {
    const options = {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true
    };
    return {
        publisher: new ioredis_1.default(env.REDIS_URL, options),
        subscriber: new ioredis_1.default(env.REDIS_URL, options),
        general: new ioredis_1.default(env.REDIS_URL, options)
    };
}
async function connectRedisClients(clients) {
    await Promise.all([
        clients.publisher.connect(),
        clients.subscriber.connect(),
        clients.general.connect()
    ]);
}
async function waitForRedis(redis, logger, attempts = 30) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await redis.ping();
            logger.info({ component: "redis" }, "redis connected");
            return;
        }
        catch (error) {
            logger.warn({ component: "redis", attempt, err: error }, "redis connection failed");
            await (0, wait_1.wait)(1000);
        }
    }
    throw new Error("Redis did not become available in time");
}
async function subscribeToNotifications(options) {
    const { subscriber, sseManager, logger } = options;
    subscriber.on("message", (channel, payload) => {
        if (channel !== exports.NOTIFICATIONS_CHANNEL) {
            return;
        }
        try {
            const message = JSON.parse(payload);
            if (message.event !== "notification.created") {
                return;
            }
            logger.info({
                channel,
                notificationId: message.notification.id,
                userId: message.notification.userId
            }, "notification event received from redis");
            sseManager.sendToUser(message.notification.userId, {
                id: message.notification.id,
                event: "notification",
                data: message.notification
            });
        }
        catch (error) {
            logger.error({ err: error, channel }, "failed to process redis message");
        }
    });
    await subscriber.subscribe(exports.NOTIFICATIONS_CHANNEL);
}
async function closeRedisClients(clients) {
    await Promise.allSettled([
        clients.publisher.quit(),
        clients.subscriber.quit(),
        clients.general.quit()
    ]);
}
//# sourceMappingURL=redis.js.map