"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSseHandler = createSseHandler;
const simulated_auth_1 = require("../middlewares/simulated-auth");
const notification_schema_1 = require("../modules/notifications/notification.schema");
const app_error_1 = require("../utils/app-error");
function createSseHandler(options) {
    const { sseManager, notificationRepository, heartbeatIntervalMs, retryMs, logger } = options;
    return (request, response, next) => {
        try {
            const userId = (0, simulated_auth_1.getSimulatedUserId)(request);
            if (!userId) {
                throw new app_error_1.AppError(401, "AUTH_REQUIRED", "Missing or invalid X-User-Id header");
            }
            const lastEventId = parseLastEventId(request);
            request.socket.setKeepAlive(true);
            request.socket.setTimeout(0);
            response.setTimeout(0);
            response.status(200);
            response.setHeader("Content-Type", "text/event-stream");
            response.setHeader("Cache-Control", "no-cache, no-transform");
            response.setHeader("Connection", "keep-alive");
            response.setHeader("X-Accel-Buffering", "no");
            response.flushHeaders();
            const client = sseManager.add(userId, response);
            let cleanedUp = false;
            const cleanup = (reason) => {
                if (cleanedUp) {
                    return;
                }
                cleanedUp = true;
                request.off("close", handleRequestClose);
                response.off("close", handleResponseClose);
                response.off("error", handleResponseError);
                sseManager.remove(client.id, reason);
            };
            const handleRequestClose = () => cleanup("request_closed");
            const handleResponseClose = () => cleanup("response_closed");
            const handleResponseError = () => cleanup("response_error");
            request.on("close", handleRequestClose);
            response.on("close", handleResponseClose);
            response.on("error", handleResponseError);
            sseManager.sendToClient(client, { retry: retryMs });
            sseManager.sendToClient(client, {
                event: "connected",
                data: { connected: true }
            });
            client.heartbeat = setInterval(() => {
                sseManager.sendToClient(client, {
                    event: "ping",
                    data: { timestamp: new Date().toISOString() }
                });
            }, heartbeatIntervalMs);
            if (client.closed && client.heartbeat) {
                clearInterval(client.heartbeat);
                client.heartbeat = undefined;
            }
            if (lastEventId) {
                void sendMissedNotifications({
                    client,
                    lastEventId,
                    notificationRepository,
                    sseManager,
                    logger
                });
            }
        }
        catch (error) {
            next(error);
        }
    };
}
function parseLastEventId(request) {
    const raw = request.header("last-event-id");
    if (!raw) {
        return null;
    }
    return notification_schema_1.notificationIdSchema.parse(raw);
}
async function sendMissedNotifications(options) {
    const { client, lastEventId, notificationRepository, sseManager, logger } = options;
    try {
        const missed = await notificationRepository.findAfterIdForUser(client.userId, lastEventId);
        for (const notification of missed) {
            if (client.closed) {
                return;
            }
            sseManager.sendToClient(client, {
                id: notification.id,
                event: "notification",
                data: notification
            });
        }
        if (missed.length > 0) {
            logger.info({
                clientId: client.id,
                userId: client.userId,
                lastEventId,
                recovered: missed.length
            }, "missed sse notifications recovered");
        }
    }
    catch (error) {
        logger.error({ err: error, clientId: client.id, userId: client.userId, lastEventId }, "failed to recover missed notifications");
        sseManager.sendToClient(client, {
            event: "error",
            data: { message: "Failed to recover missed notifications" }
        });
        sseManager.closeClient(client.id, "recovery_failed");
    }
}
//# sourceMappingURL=sse-handler.js.map