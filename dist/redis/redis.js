"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATIONS_CHANNEL = void 0;
exports.getRedisClient = getRedisClient;
exports.getRedisPublisher = getRedisPublisher;
exports.getRedisSubscriber = getRedisSubscriber;
exports.getRedisClients = getRedisClients;
exports.connectRedisClient = connectRedisClient;
exports.connectRedisClients = connectRedisClients;
exports.checkRedis = checkRedis;
exports.initializeNotificationSubscriber = initializeNotificationSubscriber;
exports.closeRedisClients = closeRedisClients;
exports.getRedisStatusMetrics = getRedisStatusMetrics;
exports.resetRedisClientsForTests = resetRedisClientsForTests;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
exports.NOTIFICATIONS_CHANNEL = "notifications";
const clients = {
    command: null,
    publisher: null,
    subscriber: null
};
const connectPromises = {
    command: null,
    publisher: null,
    subscriber: null
};
let closePromise = null;
let redisShuttingDown = false;
let redisLogger = null;
let notificationSubscriberInitialized = false;
let notificationSubscriberInitializationPromise = null;
let notificationMessageHandler = null;
function getRedisClient(options = {}) {
    return getRedisClientByRole("command", options);
}
function getRedisPublisher(options = {}) {
    return getRedisClientByRole("publisher", options);
}
function getRedisSubscriber(options = {}) {
    return getRedisClientByRole("subscriber", options);
}
function getRedisClients(options = {}) {
    return {
        general: getRedisClient(options),
        publisher: getRedisPublisher(options),
        subscriber: getRedisSubscriber(options)
    };
}
async function connectRedisClient(role, options = {}) {
    await connectClient(role, getRedisClientByRole(role, options));
}
async function connectRedisClients(options = {}) {
    await Promise.all([
        connectRedisClient("command", options),
        connectRedisClient("publisher", options),
        connectRedisClient("subscriber", options)
    ]);
}
async function checkRedis(redis = getRedisClient(), timeoutMs = env_1.env.DATABASE_CONNECTION_TIMEOUT_MS) {
    await withTimeout(redis.ping().then(() => undefined), timeoutMs, "Redis health check timed out");
}
async function initializeNotificationSubscriber(options) {
    if (redisShuttingDown) {
        throw new Error("Redis client manager is shutting down");
    }
    if (options.logger) {
        redisLogger = options.logger;
    }
    if (notificationSubscriberInitialized) {
        redisLogger?.debug({ component: "redis", redisRole: "subscriber" }, "redis subscription reused");
        return;
    }
    if (notificationSubscriberInitializationPromise) {
        return notificationSubscriberInitializationPromise;
    }
    const subscriber = getRedisSubscriber(options);
    const handler = createNotificationMessageHandler(options.sseManager, options.logger ?? redisLogger);
    notificationMessageHandler = handler;
    subscriber.on("message", handler);
    notificationSubscriberInitializationPromise = (async () => {
        try {
            await connectClient("subscriber", subscriber);
            await subscriber.subscribe(exports.NOTIFICATIONS_CHANNEL);
            notificationSubscriberInitialized = true;
            redisLogger?.info({ component: "redis", channel: exports.NOTIFICATIONS_CHANNEL }, "redis subscriber initialized");
        }
        catch (error) {
            subscriber.off("message", handler);
            notificationMessageHandler = null;
            throw error;
        }
    })().finally(() => {
        notificationSubscriberInitializationPromise = null;
    });
    return notificationSubscriberInitializationPromise;
}
async function closeRedisClients() {
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
function getRedisStatusMetrics() {
    return {
        command: clients.command?.status ?? "not_created",
        publisher: clients.publisher?.status ?? "not_created",
        subscriber: clients.subscriber?.status ?? "not_created"
    };
}
async function resetRedisClientsForTests() {
    const clientsToReset = [
        clients.subscriber,
        clients.publisher,
        clients.command
    ].filter((client) => Boolean(client));
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
function getRedisClientByRole(role, options) {
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
    const config = options.env ?? env_1.env;
    const client = new ioredis_1.default(config.REDIS_URL, createRedisOptions());
    clients[role] = client;
    installRedisListeners(client, role);
    redisLogger?.info({ component: "redis", redisRole: role }, "redis client created");
    return client;
}
function createRedisOptions() {
    return {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy(times) {
            return Math.min(times * 200, 5000);
        }
    };
}
async function connectClient(role, client) {
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
function installRedisListeners(client, role) {
    client.on("connect", () => {
        redisLogger?.debug({ component: "redis", redisRole: role }, "redis client connected");
    });
    client.on("ready", () => {
        redisLogger?.info({ component: "redis", redisRole: role }, "redis client ready");
    });
    client.on("reconnecting", () => {
        redisLogger?.warn({ component: "redis", redisRole: role }, "redis client reconnecting");
    });
    client.on("close", () => {
        redisLogger?.warn({ component: "redis", redisRole: role }, "redis client closed");
    });
    client.on("end", () => {
        redisLogger?.info({ component: "redis", redisRole: role }, "redis client ended");
    });
    client.on("error", (error) => {
        redisLogger?.error({ err: error, component: "redis", redisRole: role }, "redis client error");
    });
}
function createNotificationMessageHandler(sseManager, logger) {
    return (channel, payload) => {
        if (channel !== exports.NOTIFICATIONS_CHANNEL) {
            return;
        }
        try {
            const message = JSON.parse(payload);
            if (message.event !== "notification.created") {
                return;
            }
            logger?.info({
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
            logger?.error({ err: error, channel }, "failed to process redis message");
        }
    };
}
async function removeNotificationSubscription(subscriber) {
    if (!subscriber) {
        resetNotificationSubscriberState();
        return;
    }
    if (notificationMessageHandler) {
        subscriber.off("message", notificationMessageHandler);
    }
    if (notificationSubscriberInitialized && subscriber.status !== "end") {
        try {
            await withTimeout(subscriber.unsubscribe(exports.NOTIFICATIONS_CHANNEL).then(() => undefined), env_1.env.DATABASE_CONNECTION_TIMEOUT_MS, "Redis unsubscribe timed out");
        }
        catch (error) {
            redisLogger?.warn({ err: error, component: "redis", redisRole: "subscriber" }, "redis unsubscribe failed");
        }
    }
    resetNotificationSubscriberState();
}
function resetNotificationSubscriberState() {
    notificationSubscriberInitialized = false;
    notificationSubscriberInitializationPromise = null;
    notificationMessageHandler = null;
}
async function closeRedisClient(client, role) {
    if (!client || client.status === "end") {
        return;
    }
    if (client.status === "wait") {
        client.disconnect();
        return;
    }
    try {
        await withTimeout(client.quit().then(() => undefined), env_1.env.DATABASE_CONNECTION_TIMEOUT_MS, `Redis ${role} client shutdown timed out`);
    }
    catch (error) {
        redisLogger?.warn({ err: error, component: "redis", redisRole: role }, "redis graceful shutdown failed; disconnecting");
        client.disconnect();
    }
}
function withTimeout(promise, timeoutMs, message) {
    let timeout;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) {
            clearTimeout(timeout);
        }
    });
}
//# sourceMappingURL=redis.js.map