"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SseManager = void 0;
const node_crypto_1 = require("node:crypto");
const sse_format_1 = require("./sse-format");
class SseManager {
    logger;
    clientsByUser = new Map();
    clientsById = new Map();
    constructor(logger) {
        this.logger = logger;
    }
    add(userId, response) {
        const client = {
            id: (0, node_crypto_1.randomUUID)(),
            userId,
            response,
            closed: false,
            createdAt: new Date()
        };
        const userClients = this.clientsByUser.get(userId) ?? new Set();
        userClients.add(client);
        this.clientsByUser.set(userId, userClients);
        this.clientsById.set(client.id, client);
        this.logger.info({
            clientId: client.id,
            userId,
            sseConnections: this.countConnections(),
            connectedUsers: this.countUsers()
        }, "sse connection opened");
        return client;
    }
    remove(clientId, reason = "removed") {
        const client = this.clientsById.get(clientId);
        if (!client) {
            return false;
        }
        client.closed = true;
        if (client.heartbeat) {
            clearInterval(client.heartbeat);
            client.heartbeat = undefined;
        }
        this.clientsById.delete(clientId);
        const userClients = this.clientsByUser.get(client.userId);
        userClients?.delete(client);
        if (userClients && userClients.size === 0) {
            this.clientsByUser.delete(client.userId);
        }
        this.logger.info({
            clientId: client.id,
            userId: client.userId,
            reason,
            sseConnections: this.countConnections(),
            connectedUsers: this.countUsers()
        }, "sse connection closed");
        return true;
    }
    sendToClient(client, event) {
        if (client.closed || client.response.writableEnded || client.response.destroyed) {
            this.remove(client.id, "closed_before_write");
            return false;
        }
        try {
            const canContinue = client.response.write((0, sse_format_1.formatSseEvent)(event));
            if (!canContinue) {
                this.logger.warn({ clientId: client.id, userId: client.userId }, "sse write returned false; closing slow client");
                this.closeClient(client.id, "backpressure");
                return false;
            }
            return true;
        }
        catch (error) {
            this.logger.error({ err: error, clientId: client.id, userId: client.userId }, "sse write failed");
            this.closeClient(client.id, "write_error");
            return false;
        }
    }
    sendToUser(userId, event) {
        const clients = [...(this.clientsByUser.get(userId) ?? [])];
        const result = {
            attempted: clients.length,
            sent: 0,
            removed: 0
        };
        for (const client of clients) {
            const sent = this.sendToClient(client, event);
            if (sent) {
                result.sent += 1;
            }
            else {
                result.removed += 1;
            }
        }
        this.logger.info({
            userId,
            event: event.event,
            notificationId: event.id,
            attempted: result.attempted,
            sent: result.sent,
            removed: result.removed
        }, "sse event sent to user");
        return result;
    }
    closeClient(clientId, reason = "closed") {
        const client = this.clientsById.get(clientId);
        if (!client) {
            return;
        }
        this.remove(clientId, reason);
        if (!client.response.writableEnded && !client.response.destroyed) {
            client.response.end();
        }
    }
    closeAll(event) {
        const clients = [...this.clientsById.values()];
        for (const client of clients) {
            if (event) {
                this.sendToClient(client, event);
            }
            this.closeClient(client.id, "shutdown");
        }
    }
    countConnections() {
        return this.clientsById.size;
    }
    countUsers() {
        return this.clientsByUser.size;
    }
    countConnectionsForUser(userId) {
        return this.clientsByUser.get(userId)?.size ?? 0;
    }
}
exports.SseManager = SseManager;
//# sourceMappingURL=sse-manager.js.map