"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGracefulShutdown = registerGracefulShutdown;
function registerGracefulShutdown(options) {
    let shutdownPromise = null;
    const shutdown = (signal) => {
        if (shutdownPromise) {
            return shutdownPromise;
        }
        shutdownPromise = performGracefulShutdown(options, signal);
        return shutdownPromise;
    };
    process.once("SIGINT", () => {
        void shutdown("SIGINT")
            .then(() => process.exit(0))
            .catch((error) => {
            options.logger.fatal({ err: error }, "graceful shutdown failed");
            process.exit(1);
        });
    });
    process.once("SIGTERM", () => {
        void shutdown("SIGTERM")
            .then(() => process.exit(0))
            .catch((error) => {
            options.logger.fatal({ err: error }, "graceful shutdown failed");
            process.exit(1);
        });
    });
}
async function performGracefulShutdown(options, signal) {
    const timeoutMs = options.timeoutMs ?? 5000;
    options.logger.info({ signal }, "graceful shutdown started");
    const closeServer = new Promise((resolve, reject) => {
        options.server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
    options.sseManager.closeAll({
        event: "shutdown",
        data: { reason: "server_shutdown" }
    });
    await withTimeout(closeServer, timeoutMs, "HTTP server shutdown timed out")
        .catch((error) => {
        options.logger.warn({ err: error }, "http server shutdown timed out");
    });
    await withTimeout(options.closeRedisClients(), timeoutMs, "Redis shutdown timed out");
    await withTimeout(options.closePostgresPool(), timeoutMs, "PostgreSQL shutdown timed out");
    options.logger.info("graceful shutdown finished");
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
//# sourceMappingURL=shutdown.js.map